"""Durable single-line collector. Run beside the camera and passage sensor."""

import base64
import binascii
import json
import logging
import os
import secrets
import sqlite3
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Annotated, Literal
from urllib.error import HTTPError, URLError

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from .industrial_store import DatabaseFile, utc
from .industrial_transport import multipart, request, service_url
from .simulator import synthetic_capture
from .stereo import FORMATS, MAX_IMAGE_BYTES

logger = logging.getLogger(__name__)


SPOOL = """
CREATE TABLE IF NOT EXISTS context (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS counter (lot_id INTEGER PRIMARY KEY, sequence INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS queue (
    lot_id INTEGER NOT NULL, sequence INTEGER NOT NULL, observed_at TEXT NOT NULL, lot TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('capturing','pending','delivered')),
    captured_at TEXT, failure TEXT, left_type TEXT, left_image BLOB, right_type TEXT, right_image BLOB,
    attempts INTEGER NOT NULL DEFAULT 0, retry_at REAL NOT NULL DEFAULT 0, last_error TEXT,
    PRIMARY KEY(lot_id,sequence)
);
CREATE TABLE IF NOT EXISTS gap (
    lot_id INTEGER NOT NULL, expected INTEGER NOT NULL, received INTEGER NOT NULL, observed_at TEXT NOT NULL,
    sent INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(lot_id,expected,received)
);
"""


class Passage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    line_id: Literal["linha-1"] = "linha-1"
    lot_id: int = Field(gt=0)
    sequence: int = Field(gt=0, le=2_147_483_647)
    observed_at: AwareDatetime


class CameraGateway:
    def __init__(self, url, key, window_ms):
        self.url = service_url(url)
        self.key = key
        self.window_ms = window_ms

    def __call__(self, lot, observed_at, sequence):
        expires = datetime.fromisoformat(observed_at).timestamp() + self.window_ms / 1000
        sample_key = f"{lot['id']}:{sequence}"
        try:
            encoded = request(self.url + "/captures", "POST", token=self.key, timeout=2,
                              data={"sample_key": sample_key, "observed_at": observed_at,
                                    "expires_at": utc(datetime.fromtimestamp(expires, timezone.utc)),
                                    "calibration_id": lot["calibration_id"]}, max_response=29 * 1024 * 1024)
            payload = json.loads(encoded)
            captures = [payload["left"], payload["right"]]
            times = [datetime.fromisoformat(view["captured_at"]) for view in captures]
            lower, upper = min(times), max(times)
            if (upper - lower).total_seconds() * 1000 > lot["calibration"]["capture_skew_ms"]:
                return None, None, "par_nao_sincronizado"
            if lower < datetime.fromisoformat(observed_at) or upper.timestamp() > expires:
                return None, None, "janela_expirada"
            pair = [(view["mime"], base64.b64decode(view["base64"], validate=True)) for view in captures]
            if any(mime not in FORMATS or not 0 < len(data) <= MAX_IMAGE_BYTES for mime, data in pair):
                raise ValueError("Par da câmera inválido.")
            return utc(lower), pair, None
        except HTTPError as error:
            if error.code in (404, 410):
                return None, None, "janela_expirada"
            raise


class Spool(DatabaseFile):
    def __init__(self, path):
        super().__init__(path)
        with self.connection() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript(SPOOL)


class Collector:
    def __init__(self, spool, api_url, api_key, camera=None, bench=False):
        self.spool = Spool(spool)
        self.url = service_url(api_url) + "/v1/collector"
        self.key = api_key
        self.camera = synthetic_capture if bench else camera
        self.bench = bench
        self.capture_lock = threading.RLock()
        self.wake = threading.Event()

    def _api(self, route, method, data=None, headers=None):
        return request(self.url + route, method, token=self.key, data=data, headers=headers)

    def refresh(self):
        context = json.loads(self._api("/context", "GET"))
        if self.bench != (context["mode"] == "bancada"):
            raise ValueError("O coletor e o servidor devem usar o mesmo ambiente.")
        with self.spool.connection(write=True) as conn:
            previous = conn.execute("SELECT value FROM context").fetchone()
            if previous and json.loads(previous["value"]).get("installation_id") != context["installation_id"]:
                raise ValueError("O spool pertence a outra instalação.")
            conn.execute("INSERT INTO context VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
                         (json.dumps(context),))
        return context["lot"]

    def accept(self, passage):
        observed_at = utc(passage.observed_at)
        if abs(passage.observed_at.timestamp() - time.time()) > 24 * 3600 or passage.observed_at.timestamp() > time.time() + 2:
            raise HTTPException(422, "Relógio do sensor ou data do evento inválida.")
        with self.capture_lock:
            with self.spool.connection() as conn:
                context = conn.execute("SELECT value FROM context").fetchone()
            lot = json.loads(context["value"])["lot"] if context else None
            if not lot or lot["id"] != passage.lot_id:
                try:
                    lot = self.refresh()
                except (OSError, ValueError) as error:
                    raise HTTPException(503, "Sincronize o lote com o servidor.") from error
            if not lot or lot["id"] != passage.lot_id or lot["started_at"] > observed_at:
                raise HTTPException(409, "O evento não pertence ao lote autorizado.")
            gap = False
            with self.spool.connection(write=True) as conn:
                current = conn.execute("SELECT sequence FROM counter WHERE lot_id=?", (passage.lot_id,)).fetchone()
                expected = (current["sequence"] if current else 0) + 1
                sequence = passage.sequence
                if sequence < expected:
                    row = conn.execute("SELECT state,observed_at FROM queue WHERE lot_id=? AND sequence=?",
                                       (passage.lot_id, sequence)).fetchone()
                    if row and row["observed_at"] != observed_at:
                        raise HTTPException(409, "Evento repetido com horário diferente.")
                    if not row or row["state"] != "capturing":
                        return {"status": "duplicado", "sequence": sequence}
                elif sequence > expected:
                    conn.execute("INSERT OR IGNORE INTO gap(lot_id,expected,received,observed_at) VALUES (?,?,?,?)",
                                 (passage.lot_id, expected, sequence, observed_at))
                    gap = True
                else:
                    conn.execute("""
                        INSERT INTO counter VALUES (?,?) ON CONFLICT(lot_id) DO UPDATE SET sequence=excluded.sequence
                    """, (passage.lot_id, sequence))
                    if sequence % 50 == 0:
                        conn.execute("""
                            INSERT INTO queue(lot_id,sequence,observed_at,lot,state) VALUES (?,?,?,?,'capturing')
                        """, (passage.lot_id, sequence, observed_at, json.dumps(lot)))
            if gap:
                self.wake.set()
                raise HTTPException(409, f"Lacuna na contagem. Reenvie a partir da chapa {expected}.")
            if sequence % 50:
                return {"status": "contado", "sequence": sequence}
            self.capture(lot, sequence, observed_at)
            return {"status": "amostra_em_fila", "sequence": sequence}

    def capture(self, lot, sequence, observed_at):
        # The gateway uses the same sample key after a restart and can return the original pair.
        try:
            captured_at, pair, failure = self.camera(lot, observed_at, sequence)
        except (OSError, ValueError, TypeError, KeyError, binascii.Error):
            # Keep 'capturing' until the gateway can replay the pair or the recovery window expires.
            age = time.time() - datetime.fromisoformat(observed_at).timestamp()
            if age < 5:
                self.wake.set()
                return
            captured_at, pair, failure = None, None, "camera_indisponivel"
        images = (*pair[0], *pair[1]) if pair else (None,) * 4
        with self.spool.connection(write=True) as conn:
            conn.execute("""
                UPDATE queue SET state='pending',captured_at=?,failure=?,left_type=?,left_image=?,right_type=?,right_image=?
                WHERE lot_id=? AND sequence=? AND state='capturing'
            """, (captured_at, failure, *images, lot["id"], sequence))
        self.wake.set()

    def recover(self):
        with self.capture_lock:
            with self.spool.connection() as conn:
                rows = conn.execute("SELECT * FROM queue WHERE state='capturing' ORDER BY lot_id,sequence LIMIT 1").fetchall()
            for row in rows:
                self.capture(json.loads(row["lot"]), row["sequence"], row["observed_at"])

    def send_pending(self):
        with self.spool.connection() as conn:
            pending = conn.execute("""
                SELECT * FROM queue WHERE state='pending' AND retry_at<=? ORDER BY lot_id,sequence LIMIT 1
            """, (time.time(),)).fetchone()
        if not pending:
            return False
        keys = ("lot_id", "sequence", "observed_at", "captured_at", "failure")
        pair = [(pending[f"{side}_type"], pending[f"{side}_image"]) for side in ("left", "right")] if pending["left_type"] else None
        data, headers = multipart({key: pending[key] for key in keys}, pair)
        identifiers = (pending["lot_id"], pending["sequence"])
        try:
            self._api("/samples", "POST", data, headers)
        except (HTTPError, URLError, OSError, ValueError) as error:
            code = str(error.code) if isinstance(error, HTTPError) else "rede"
            delay = min(60, 2 ** min(pending["attempts"], 6))
            with self.spool.connection(write=True) as conn:
                conn.execute("""
                    UPDATE queue SET attempts=attempts+1,retry_at=?,last_error=? WHERE lot_id=? AND sequence=?
                """, (time.time() + delay, code, *identifiers))
        else:
            with self.spool.connection(write=True) as conn:
                conn.execute("""
                    UPDATE queue SET state='delivered',left_image=NULL,right_image=NULL,last_error=NULL WHERE lot_id=? AND sequence=?
                """, identifiers)
        return True

    def send_health(self):
        with self.spool.connection() as conn:
            gap = conn.execute("SELECT lot_id,expected,received,observed_at FROM gap WHERE sent=0 LIMIT 1").fetchone()
            buffered = conn.execute("SELECT count(*) FROM queue WHERE state != 'delivered'").fetchone()[0]
        if gap:
            self._api("/incidents", "POST", dict(gap))
            with self.spool.connection(write=True) as conn:
                conn.execute("UPDATE gap SET sent=1 WHERE lot_id=? AND expected=? AND received=?",
                             (gap["lot_id"], gap["expected"], gap["received"]))
        self._api("/heartbeat", "POST", {"buffered": buffered})
        self.refresh()

    def upload(self, stop):
        while not stop.is_set():
            self.wake.clear()
            try:
                if self.send_pending():
                    continue
            except sqlite3.Error:
                logger.warning("O spool de capturas está indisponível para envio.")
            self.wake.wait(0.2)

    def supervise(self, stop):
        while not stop.is_set():
            try:
                self.send_health()
            except (OSError, ValueError, sqlite3.Error):
                logger.warning("O coletor não pôde sincronizar sua saúde e contexto.")
            stop.wait(2)

    def recover_captures(self, stop):
        while not stop.is_set():
            try:
                self.recover()
            except sqlite3.Error:
                logger.warning("O spool de capturas está indisponível para recuperação.")
            stop.wait(0.25)


def configured_collector():
    required = ("ABAULYTICS_SPOOL", "ABAULYTICS_COLLECTOR_API", "ABAULYTICS_COLLECTOR_KEY", "ABAULYTICS_SENSOR_KEY")
    if any(not os.getenv(key) for key in required):
        raise RuntimeError("Configure o spool, a API e as credenciais do coletor e do sensor.")
    bench = os.getenv("ABAULYTICS_INDUSTRIAL_MODE", "bancada") == "bancada"
    camera = None if bench else CameraGateway(os.environ["ABAULYTICS_CAMERA_URL"], os.environ["ABAULYTICS_CAMERA_KEY"],
                                             int(os.environ["ABAULYTICS_CAPTURE_WINDOW_MS"]))
    keys = [os.environ[key] for key in required[2:]]
    if camera:
        keys.append(camera.key)
        if not 0 < camera.window_ms <= 5000:
            raise RuntimeError("A janela de captura precisa estar entre 1 e 5000 ms.")
    if len(set(keys)) != len(keys) or any(len(key) < 32 for key in keys):
        raise RuntimeError("Configure credenciais distintas, com pelo menos 32 caracteres.")
    return Collector(os.environ[required[0]], os.environ[required[1]], keys[0], camera, bench)


@asynccontextmanager
async def lifespan(application):
    application.state.collector = configured_collector()
    stop = threading.Event()
    collector = application.state.collector
    workers = [threading.Thread(target=target, args=(stop,), daemon=True)
               for target in (collector.upload, collector.supervise, collector.recover_captures)]
    for worker in workers:
        worker.start()
    try:
        yield
    finally:
        stop.set()
        collector.wake.set()
        for worker in workers:
            worker.join(timeout=7)


app = FastAPI(lifespan=lifespan)


def sensor(authorization: Annotated[str | None, Header()] = None):
    configured = os.environ["ABAULYTICS_SENSOR_KEY"]
    if not authorization or not secrets.compare_digest(authorization.encode(), f"Bearer {configured}".encode()):
        raise HTTPException(401, "Credencial do sensor inválida.")


@app.post("/v1/passage", dependencies=[Depends(sensor)])
def passage(data: Passage):
    return app.state.collector.accept(data)


@app.get("/v1/status", dependencies=[Depends(sensor)])
def status():
    collector = app.state.collector
    with collector.spool.connection() as conn:
        context = conn.execute("SELECT value FROM context").fetchone()
        lot = json.loads(context["value"])["lot"] if context else None
        current = conn.execute("SELECT sequence FROM counter WHERE lot_id=?", (lot["id"],)).fetchone() if lot else None
        counts = {row["state"]: row["total"] for row in conn.execute("SELECT state,count(*) AS total FROM queue GROUP BY state")}
    return {"lot_id": lot["id"] if lot else None, "sequence": current["sequence"] if current else 0,
            "queue": counts, "mode": "bancada" if collector.bench else "producao"}
