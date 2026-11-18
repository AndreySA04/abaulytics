import asyncio
import csv
import hashlib
import hmac
import io
import json
import os
import sqlite3
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import urlsplit

import cv2
import numpy as np
from fastapi import HTTPException

from api.calibration import fit_calibration
from api.collector import Collector, Passage
from api.industrial import get_store, open_store
from api.industrial_cli import deliver_one
from api.industrial_store import micrometers, utc
from api.industrial_transport import multipart
from api.main import app
from api.qualification import qualify
from api.simulator import BENCH_CALIBRATION, stereo_images
from api.stereo import Calibration, STEREO_METHOD, measure_pair


COLLECTOR = "c" * 40
CORPORATE = "i" * 40
PASSWORD = " teste senha longa "


async def asgi(method, url, token=None, data=None, headers=None):
    path = urlsplit(url)
    received = False
    messages = []
    hdrs = dict(headers or {})
    if isinstance(data, dict):
        data = json.dumps(data).encode()
        hdrs["Content-Type"] = "application/json"
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    if data is not None:
        hdrs["Content-Length"] = str(len(data))

    async def receive():
        nonlocal received
        if received:
            await asyncio.Future()
        received = True
        return {"type": "http.request", "body": bytes(data or b""), "more_body": False}

    async def send(message):
        messages.append(message)

    await app({
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method,
        "scheme": "http", "root_path": "", "path": path.path, "raw_path": path.path.encode(),
        "query_string": path.query.encode(), "headers": [(k.lower().encode(), v.encode()) for k, v in hdrs.items()],
        "client": ("127.0.0.1", 10001), "server": ("test", 80),
    }, receive, send)
    start = next(message for message in messages if message["type"] == "http.response.start")
    return start["status"], b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")


class IndustrialTests(unittest.TestCase):
    def setUp(self):
        data = self.enterContext(TemporaryDirectory())
        self.db_path = Path(data) / "production.db"
        self.spool_path = Path(data) / "collector.db"
        self.enterContext(patch.dict(os.environ, {
            "ABAULYTICS_INDUSTRIAL_DB": str(self.db_path), "ABAULYTICS_INDUSTRIAL_MODE": "bancada",
            "ABAULYTICS_COLLECTOR_KEY": COLLECTOR, "ABAULYTICS_CORPORATE_KEY": CORPORATE,
        }))
        self.addCleanup(open_store.cache_clear)
        self.store = get_store()
        self.tokens = {}

    def call(self, method, path, *, token=None, data=None, headers=None, status=200, raw=False):
        code, payload = asyncio.run(asgi(method, "/v1" + path, token, data, headers))
        self.assertEqual(code, status, payload[:300])
        return payload if raw else json.loads(payload) if payload else None

    def use_role(self, role):
        if role not in self.tokens:
            self.store.provision(role, "Pessoa de teste", role, PASSWORD)
            self.tokens[role] = self.call("POST", "/auth/login", data={"badge": role, "password": PASSWORD})["token"]
        return self.tokens[role]

    def start_lot(self, order="OP-1"):
        self.call("PUT", f"/corporate/orders/{order}", token=CORPORATE,
                  data={"width_mm": 500, "product": "Chapa A"}, status=204)
        return self.call("POST", "/lots", token=self.use_role("operador"),
                         data={"order_number": order}, status=201)

    def enable_stereo(self):
        technician = self.use_role("tecnico")
        self.call("PUT", "/calibrations/bancada-estereo", token=technician, data=BENCH_CALIBRATION, status=204)
        self.call("PUT", "/configuration/active", token=technician,
                  data={"version": "estereo_v1", "calibration_id": "bancada-estereo"}, status=204)

    def sample(self, lot, sequence, pair=None, failure=None):
        timestamp = utc()
        data, headers = multipart({"lot_id": lot["id"], "sequence": sequence, "observed_at": timestamp,
                                   "captured_at": timestamp if pair else None, "failure": failure}, pair)
        return self.call("POST", "/collector/samples", token=COLLECTOR, data=data, headers=headers)

    def test_calibrated_stereo_uses_vertical_distance_and_minimum_resolution(self):
        for expected in (0, 8, -12, 16):
            with self.subTest(expected=expected):
                measured = measure_pair(stereo_images(expected, slope=16, background=210),
                                        BENCH_CALIBRATION, STEREO_METHOD)
                self.assertAlmostEqual(measured / 1000, abs(expected), delta=0.20)
        small = ("image/png", cv2.imencode(".png", np.zeros((240, 460), np.uint8))[1].tobytes())
        with self.assertRaisesRegex(ValueError, "480p"):
            measure_pair((small, small), BENCH_CALIBRATION, STEREO_METHOD)
        self.assertEqual(micrometers("12.001"), 12001)

    def test_calibration_fits_a_vertical_camera_pair_from_checkerboards(self):
        directory = self.db_path.parent
        intrinsic = np.asarray(BENCH_CALIBRATION["left_matrix"], dtype=np.float64)
        pairs = []
        for pose in range(8):
            angle = np.zeros(3) if pose == 0 else np.array([0.16 * np.sin(pose), 0.2 * np.cos(pose), 0.1 * np.sin(2 * pose)])
            offset = np.array([-65.0 + 2 * pose, -49 + 4 * np.sin(pose), 370 + 10.0 * pose])
            names = []
            for camera in range(2):
                photo = np.full((480, 640), 245, dtype=np.uint8)
                for y in range(-1, 5):
                    for x in range(-1, 7):
                        if (x + y) % 2:
                            continue
                        points = np.array([[x, y, 0], [x + 1, y, 0], [x + 1, y + 1, 0], [x, y + 1, 0]], np.float32) * 20
                        pixels, _ = cv2.projectPoints(points, angle, offset + [0, 8 * camera, 0], intrinsic, None)
                        polygon = np.rint(pixels.reshape(-1, 2) * 16).astype(np.int32)
                        cv2.fillConvexPoly(photo, polygon, 10, cv2.LINE_AA, 4)
                name = f"{pose}-{camera}.png"
                self.assertTrue(cv2.imwrite(str(directory / name), photo))
                names.append(name)
            pairs.append(names)
        manifest = directory / "calibration.json"
        manifest.write_text(json.dumps({"columns": 7, "rows": 5, "square_mm": 20,
                                        "capture_skew_ms": 1, "pairs": pairs}), encoding="utf-8")
        calibration = Calibration.model_validate_json(fit_calibration(manifest))
        self.assertAlmostEqual(calibration.translation_mm[1], 8, delta=1)
        self.assertLess(calibration.target_error_px, 0.4)

    def test_threshold_and_exact_idempotency_after_transaction_abort(self):
        self.enable_stereo()
        lot = self.start_lot()
        observed_at = utc()
        first_pair = stereo_images(8)
        payload, headers = multipart({"lot_id": lot["id"], "sequence": 50, "observed_at": observed_at,
                                      "captured_at": observed_at}, first_pair)
        with self.store.connection(write=True) as conn:
            conn.execute("CREATE TRIGGER simulated_disk_error BEFORE INSERT ON capture BEGIN SELECT RAISE(ABORT,'disk'); END;")
        with self.assertRaises(sqlite3.IntegrityError):
            self.call("POST", "/collector/samples", data=payload, headers=headers, token=COLLECTOR)
        with self.store.connection(write=True) as conn:
            self.assertEqual(conn.execute("SELECT count(*) FROM sample").fetchone()[0], 0)
            conn.execute("DROP TRIGGER simulated_disk_error")
        for i, (value, expected) in enumerate(((11999, "conforme"), (12000, "conforme"), (12001, "nao_conforme")), 1):
            fields = {"lot_id": lot["id"], "sequence": 50 * i, "observed_at": observed_at, "captured_at": observed_at}
            body, boundary = multipart(fields, first_pair)
            with patch("api.industrial.measure_pair", return_value=value) as compute:
                row = self.call("POST", "/collector/samples", data=body, headers=boundary, token=COLLECTOR)
                again = self.call("POST", "/collector/samples", data=body, headers=boundary, token=COLLECTOR)
                compute.assert_called_once()
            self.assertEqual(row["classification"], expected)
            self.assertEqual(row, again)
        wrong, boundary = multipart({"lot_id": lot["id"], "sequence": 50,
                                     "observed_at": observed_at, "failure": "janela_expirada"}, None)
        self.call("POST", "/collector/samples", token=COLLECTOR, data=wrong, headers=boundary, status=409)
        with self.store.connection() as conn:
            self.assertEqual(conn.execute("SELECT count(*) FROM capture").fetchone()[0], 3)

    def test_history_reports_dashboard_authorization_and_unlink(self):
        self.enable_stereo()
        lot = self.start_lot()
        initial = self.call("GET", "/dashboard", token=self.tokens["operador"])
        success = self.sample(lot, 50, stereo_images(16))
        fail = self.sample(lot, 100, failure="janela_expirada")
        dashboard = self.call("GET", "/dashboard", token=self.tokens["operador"])
        self.assertEqual(dashboard["counts"], {"valid": 1, "nonconforming": 1, "failed": 1})
        changes = self.call("GET", f"/dashboard/changes?after={initial['cursor']}", token=self.tokens["operador"])
        self.assertEqual([row["id"] for row in changes["items"]], [success["id"], fail["id"]])
        self.call("POST", "/dashboard/rendered", token=self.tokens["operador"], status=204,
                  data={"sample_id": success["id"], "rendered_at": utc()})
        self.call("GET", "/readings", token=self.tokens["operador"], status=403)
        analyst = self.use_role("analista")
        self.call("POST", "/lots", token=analyst, status=403, data={"order_number": "OP-1"})
        self.call("GET", "/readings", status=401)
        query = "?order_number=OP-1&classification=nao_conforme&width_mm=500&product=Chapa%20A"
        results = self.call("GET", "/readings" + query, token=analyst)
        self.assertEqual(results["items"], [success])
        self.assertEqual(self.call("GET", "/trends", token=analyst)["items"][0]["failed"], 1)
        export = {"ceiling": results["ceiling"], "order_number": "OP-1", "classification": "nao_conforme",
                  "width_mm": 500, "product": "Chapa A"}
        self.sample(lot, 150, stereo_images(18))
        csv_bytes = self.call("POST", "/reports", token=analyst, data={**export, "format": "csv"}, raw=True)
        rows = list(csv.DictReader(io.StringIO(csv_bytes.decode("utf-8-sig"))))
        self.assertEqual([int(row["ID"]) for row in rows], [success["id"]])
        pdf = self.call("POST", "/reports", token=analyst, data={**export, "format": "pdf"}, raw=True)
        self.assertTrue(pdf.startswith(b"%PDF-"))
        image = self.call("GET", f"/readings/{success['id']}/image/right", token=analyst, raw=True)
        self.assertTrue(image.startswith(b"\x89PNG"))
        with self.store.connection() as conn:
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute("DELETE FROM sample WHERE id=?", (success["id"],))
            with self.assertRaises(sqlite3.IntegrityError):
                conn.execute("UPDATE capture SET left_image=x'00' WHERE sample_id=?", (success["id"],))
        operator = self.tokens["operador"]
        self.call("POST", "/auth/remove-account", token=operator,
                  data={"badge": "operador", "password": PASSWORD}, status=409)
        self.call("POST", f"/lots/{lot['id']}/close", token=operator, status=204)
        self.call("POST", "/auth/remove-account", token=operator,
                  data={"badge": "operador", "password": PASSWORD}, status=204)
        self.call("GET", "/dashboard", token=operator, status=401)
        auditor = self.use_role("auditor")
        audit = self.call("GET", "/audit", token=auditor)["items"]
        self.assertTrue(any(row["action"] == "lote_aberto" and row["badge"] is None for row in audit))
        self.assertTrue(any(row["action"] == "leitura_renderizada" for row in audit))
        self.assertEqual(len(self.call("GET", "/readings", token=analyst)["items"]), 3)

    def test_orders_and_versions_stay_reproducible(self):
        operator = self.use_role("operador")
        self.call("POST", "/lots", token=operator, data={"order_number": "INEXISTENTE"}, status=422)
        self.enable_stereo()
        old_lot = self.start_lot()
        technician = self.tokens["tecnico"]
        self.call("PUT", "/algorithms/v2", token=technician, data={"method": "estereo_vertical_v2"}, status=204)
        config = {"version": "v2", "calibration_id": "bancada-estereo"}
        self.call("PUT", "/configuration/active", token=technician, data=config, status=409)
        old = self.sample(old_lot, 50, stereo_images(8))
        self.call("POST", f"/lots/{old_lot['id']}/close", token=operator, status=204)
        self.call("PUT", "/configuration/active", token=technician, data=config, status=204)
        new_lot = self.start_lot("OP-2")
        new = self.sample(new_lot, 50, stereo_images(8))
        self.assertEqual(old["version"], "estereo_v1")
        self.assertEqual(new["version"], "v2")
        with self.store.connection() as conn:
            self.assertEqual(self.store.reading(conn, old["id"]), old)
        self.call("POST", "/auth/logout", token=operator, status=204)
        self.call("GET", "/dashboard", token=operator, status=401)

    def test_collector_recovers_after_restart_and_deduplicates_line_events(self):
        self.enable_stereo()
        lot = self.start_lot()
        collector = Collector(self.spool_path, "http://127.0.0.1", COLLECTOR, bench=True)
        capture_times = {}

        def event(sequence):
            capture_times.setdefault(sequence, datetime.now(timezone.utc))
            return Passage(lot_id=lot["id"], sequence=sequence, observed_at=capture_times[sequence])

        def transport(route, method, raw=None, headers=None):
            status, data = asyncio.run(asgi(method, "/v1/collector" + route, COLLECTOR, raw, headers))
            self.assertLess(status, 300, data)
            return data

        with patch.object(collector, "_api", side_effect=transport):
            self.assertEqual(collector.refresh()["id"], lot["id"])
            with self.assertRaises(HTTPException) as raised:
                collector.accept(event(2))
            self.assertEqual(raised.exception.status_code, 409)
            self.assertEqual(collector.accept(event(1))["status"], "contado")
            self.assertEqual(collector.accept(event(1))["status"], "duplicado")
            for sequence in range(2, 51):
                collector.accept(event(sequence))
            with patch.object(collector, "_api", side_effect=TimeoutError):
                self.assertTrue(collector.send_pending())
            collector.send_health()
        restart = Collector(self.spool_path, "http://127.0.0.1", COLLECTOR, bench=True)
        with restart.spool.connection(write=True) as conn:
            conn.execute("UPDATE queue SET retry_at=0")
        with patch.object(restart, "_api", side_effect=transport):
            self.assertTrue(restart.send_pending())
            for sequence in range(51, 101):
                restart.accept(event(sequence))
            self.assertTrue(restart.send_pending())
            self.assertFalse(restart.send_pending())
        dashboard = self.call("GET", "/dashboard", token=self.tokens["operador"])
        self.assertEqual([row["sequence"] for row in dashboard["recent"]], [100, 50])
        self.assertEqual([row["classification"] for row in dashboard["recent"]], ["nao_conforme", "conforme"])
        self.assertEqual(dashboard["sequence_gap"], 1)
        self.assertEqual(restart.accept(event(100))["status"], "duplicado")

    def test_webhook_retries_with_same_id_and_signed_body(self):
        self.enable_stereo()
        record = self.sample(self.start_lot(), 50, stereo_images(16))
        secret = "W" * 40
        calls = []

        def endpoint(url, method, *, data, headers, **kwargs):
            expected = hmac.new(secret.encode(), headers["X-Abaulytics-Timestamp"].encode() + b"." + data, hashlib.sha256)
            self.assertEqual(headers["X-Abaulytics-Signature"], "sha256=" + expected.hexdigest())
            self.assertEqual(json.loads(data)["reading"], record)
            calls.append(headers["Idempotency-Key"])
            if len(calls) == 1:
                raise HTTPError(url, 503, "Unavailable", None, io.BytesIO())
            return b""

        with patch("api.industrial_cli.request", side_effect=endpoint):
            self.assertTrue(deliver_one(self.store, "https://example.org", secret))
            with self.store.connection(write=True) as conn:
                conn.execute("UPDATE delivery SET next_attempt=0")
            self.assertTrue(deliver_one(self.store, "https://example.org", secret))
            self.assertFalse(deliver_one(self.store, "https://example.org", secret))
        self.assertEqual(calls[0], calls[1])

    def test_corrupt_pair_does_not_create_a_measurement(self):
        self.enable_stereo()
        lot = self.start_lot()
        row = self.sample(lot, 50, [("image/png", b"invalid"), ("image/png", b"invalid")])
        self.assertEqual(row["failure"], "imagem_inutilizavel")
        self.assertIsNone(row["classification"])
        with self.store.connection() as conn:
            self.assertIsNone(conn.execute("SELECT * FROM delivery").fetchone())

    def test_qualification_counts_missing_render_and_unions_outages(self):
        self.enable_stereo()
        lot = self.start_lot()
        first = self.sample(lot, 50, stereo_images(8))
        self.sample(lot, 100, stereo_images(16))
        captured = datetime.fromisoformat(first["captured_at"])
        self.call("POST", "/dashboard/rendered", token=self.tokens["operador"], status=204,
                  data={"sample_id": first["id"], "rendered_at": utc(captured + timedelta(milliseconds=400))})
        start, end = captured - timedelta(seconds=10), captured + timedelta(seconds=90)
        outages = [{"start": utc(start), "end": utc(start + timedelta(seconds=4))},
                   {"start": utc(start + timedelta(seconds=2)), "end": utc(start + timedelta(seconds=5))}]
        report = qualify(self.store, start, end, "operador",
                         [{"sample_id": first["id"], "reference_mm": 8}], outages)
        self.assertEqual(report["disponibilidade_percentual"], 95)
        self.assertTrue(report["limite_0_20mm_atendido"])
        self.assertEqual(report["max_captura_tela_ms"], 400)
        self.assertEqual(report["leituras_sem_renderizacao_valida"], 1)
        self.assertFalse(report["limite_2s_atendido"])


if __name__ == "__main__":
    unittest.main()
