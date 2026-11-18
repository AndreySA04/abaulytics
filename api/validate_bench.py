"""Run the industrial bench through real local HTTP connections and isolated databases."""

import hashlib
import hmac
import json
import os
import secrets
import socket
import subprocess
import sys
import threading
import time
from contextlib import ExitStack, contextmanager
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from tempfile import TemporaryDirectory

from .industrial_cli import bench_calibration, deliver_one
from .industrial_store import IndustrialStore, utc
from .industrial_transport import request


def local_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def wait_until(check, deadline=12):
    until = time.monotonic() + deadline
    while time.monotonic() < until:
        try:
            if (value := check()):
                return value
        except OSError:
            pass
        time.sleep(0.1)
    raise RuntimeError("O ensaio excedeu o tempo de espera.")


@contextmanager
def uvicorn(module, port, env, log_file):
    with log_file.open("w", encoding="utf-8") as log:
        options = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
        process = subprocess.Popen([sys.executable, "-m", "uvicorn", module, "--host", "127.0.0.1",
                                    "--port", str(port), "--no-access-log"], env=env, stdout=log, stderr=log, **options)
        try:
            yield
        except BaseException:
            log.flush()
            print(log_file.read_text(encoding="utf-8", errors="replace"), file=sys.stderr)
            raise
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=6)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()


@contextmanager
def webhook_receiver(secret, seen):
    class Receiver(BaseHTTPRequestHandler):
        def do_POST(self):
            body = self.rfile.read(int(self.headers["Content-Length"]))
            timestamp = self.headers["X-Abaulytics-Timestamp"]
            payload = json.loads(body)
            signature = hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
            valid = hmac.compare_digest(self.headers["X-Abaulytics-Signature"], "sha256=" + signature)
            valid &= self.headers["Idempotency-Key"] == payload["event_id"]
            if valid:
                seen[payload["event_id"]] = payload["reading"]["id"]
            self.send_response(204 if valid else 403)
            self.end_headers()

        def log_message(self, *_):
            pass

    with ThreadingHTTPServer(("127.0.0.1", 0), Receiver) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}/readings"
        finally:
            server.shutdown()
            thread.join()


def run():
    with ExitStack() as stack:
        directory = Path(stack.enter_context(TemporaryDirectory()))
        api_port, collector_port = local_port(), local_port()
        api = f"http://127.0.0.1:{api_port}"
        collector = f"http://127.0.0.1:{collector_port}"
        password = secrets.token_urlsafe(24)
        edge_key, sensor_key, corporate_key, hook_key = (secrets.token_urlsafe(32) for _ in range(4))
        settings = {
            "ABAULYTICS_INDUSTRIAL_DB": str(directory / "industrial.db"),
            "ABAULYTICS_INDUSTRIAL_MODE": "bancada", "ABAULYTICS_SPOOL": str(directory / "collector.db"),
            "ABAULYTICS_COLLECTOR_API": api, "ABAULYTICS_COLLECTOR_KEY": edge_key,
            "ABAULYTICS_SENSOR_KEY": sensor_key, "ABAULYTICS_CORPORATE_KEY": corporate_key,
            "CORS_ORIGINS": "", "PYTHONDONTWRITEBYTECODE": "1",
        }
        store = IndustrialStore(settings["ABAULYTICS_INDUSTRIAL_DB"], "bancada")
        store.provision("E2-OPERADOR", "Operador de teste", "operador", password)
        store.provision("E2-ANALISTA", "Analista de teste", "analista", password)
        from unittest.mock import patch
        with patch.dict(os.environ, settings):
            bench_calibration(None)
        env = {**os.environ, **settings}
        stack.enter_context(uvicorn("api.main:app", api_port, env, directory / "api.txt"))
        wait_until(lambda: request(api + "/v1/collector/context", "GET", token=edge_key))
        stack.enter_context(uvicorn("api.collector:app", collector_port, env, directory / "collector.txt"))
        request(api + "/v1/corporate/orders/E2-001", "PUT", data={"width_mm": 500, "product": "Bancada E2"}, token=corporate_key)
        operator = json.loads(request(api + "/v1/auth/login", "POST",
                                      data={"badge": "E2-OPERADOR", "password": password}))["token"]
        analyst = json.loads(request(api + "/v1/auth/login", "POST",
                                     data={"badge": "E2-ANALISTA", "password": password}))["token"]
        lot = json.loads(request(api + "/v1/lots", "POST", data={"order_number": "E2-001"}, token=operator))
        wait_until(lambda: json.loads(request(collector + "/v1/status", "GET", token=sensor_key))["lot_id"] == lot["id"])
        cursor = json.loads(request(api + "/v1/dashboard", "GET", token=operator))["cursor"]
        rows, timings = [], []

        def follow():
            nonlocal cursor
            for _ in range(4):
                payload = json.loads(request(api + f"/v1/dashboard/changes?after={cursor}", "GET",
                                             token=operator, timeout=6))
                cursor = payload["cursor"]
                for row in payload["items"]:
                    timings.append(round((datetime.now(timezone.utc) - datetime.fromisoformat(row["captured_at"])).total_seconds() * 1000))
                    rows.append(row)
                if len(rows) >= 2:
                    break

        subscriber = threading.Thread(target=follow, daemon=True)
        subscriber.start()
        for sequence in range(1, 101):
            request(collector + "/v1/passage", "POST", token=sensor_key,
                    data={"lot_id": lot["id"], "sequence": sequence, "observed_at": utc()})
        subscriber.join(timeout=12)
        if [row["sequence"] for row in rows] != [50, 100] or [row["classification"] for row in rows] != ["conforme", "nao_conforme"]:
            raise RuntimeError(f"Amostragem ou classificação divergente: {rows}")
        seen = {}
        receiver = stack.enter_context(webhook_receiver(hook_key, seen))
        for _ in rows:
            deliver_one(store, receiver, hook_key)
        if sorted(seen.values()) != sorted(row["id"] for row in rows):
            raise RuntimeError("Entrega corporativa não confirmada.")
        history = json.loads(request(api + "/v1/readings?order_number=E2-001", "GET", token=analyst))
        for format, expected in (("pdf", b"%PDF-"), ("csv", b"\xef\xbb\xbfID")):
            export = request(api + "/v1/reports", "POST", token=analyst, timeout=10,
                             data={"order_number": "E2-001", "ceiling": history["ceiling"], "format": format})
            if not export.startswith(expected):
                raise RuntimeError(f"Exportação {format} inválida.")
        print("Bancada HTTP aprovada: 100 eventos, amostras nas chapas 50 e 100, PDF, CSV e dois webhooks assinados.")
        print(f"Captura até receber atualização HTTP, em ms: {timings}")


if __name__ == "__main__":
    run()
