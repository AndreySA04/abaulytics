"""Maintenance, simulator and corporate webhook worker."""

import argparse
import getpass
import hashlib
import hmac
import json
import os
import sqlite3
import time
from pathlib import Path
from urllib.error import HTTPError

from fastapi import HTTPException

from .calibration import fit_calibration
from .industrial import get_store
from .industrial_store import ROLES, audit, utc
from .industrial_transport import request, service_url
from .simulator import BENCH_CALIBRATION
from .stereo import Calibration


def provision(args):
    store = get_store()
    password = getpass.getpass("Senha industrial: ")
    if password != getpass.getpass("Confirme a senha: "):
        raise ValueError("As senhas não correspondem.")
    store.provision(args.badge, args.name, args.role, password)
    print("Conta provisionada.")


def bench_calibration(_args):
    store = get_store()
    if store.mode != "bancada":
        raise ValueError("A calibração sintética é exclusiva de bancada.")
    with store.connection(write=True) as conn:
        if store.current_lot(conn):
            raise ValueError("Encerre o lote antes de ativar a calibração.")
        parameters = Calibration.model_validate(BENCH_CALIBRATION).model_dump_json()
        conn.execute("INSERT OR IGNORE INTO calibration VALUES ('bancada-estereo',?,?)", (parameters, utc()))
        conn.execute("UPDATE configuration SET calibration_id='bancada-estereo' WHERE id=1")
        audit(conn, "calibracao_bancada", role="manutencao")
    print("Calibração sintética ativada.")


def order(args):
    path = service_url(args.url) + f"/v1/corporate/orders/{args.number}"
    request(path, "PUT", token=os.environ["ABAULYTICS_CORPORATE_KEY"],
            data={"width_mm": args.width, "product": args.product})
    print("Ordem de produção recebida.")


def simulate(args):
    base = service_url(args.collector_url)
    key = os.environ["ABAULYTICS_SENSOR_KEY"]
    context = json.loads(request(base + "/v1/status", "GET", token=key))
    if context["mode"] != "bancada":
        raise ValueError("O simulador de passagem exige um coletor em modo bancada.")
    if not context["lot_id"]:
        raise ValueError("Abra um lote em Produção e aguarde a sincronização do coletor.")
    if args.count <= 0 or args.interval < 0:
        raise ValueError("Informe quantidade positiva e intervalo não negativo.")
    for number in range(context["sequence"] + 1, context["sequence"] + args.count + 1):
        payload = {"line_id": "linha-1", "lot_id": context["lot_id"], "sequence": number, "observed_at": utc()}
        event = json.loads(request(base + "/v1/passage", "POST", token=key, data=payload))
        if number % 50 == 0:
            print(f"Chapa {number}: {event['status']}")
        if args.interval:
            time.sleep(args.interval)


def deliver_one(store, url, secret):
    with store.connection() as conn:
        delivery = conn.execute("""
            SELECT sample_id,attempts FROM delivery WHERE delivered_at IS NULL AND next_attempt<=?
            ORDER BY sample_id LIMIT 1
        """, (time.time(),)).fetchone()
        if not delivery:
            return False
        record = store.reading(conn, delivery["sample_id"])
    event_id = f"{store.installation_id}:{record['id']}"
    body = json.dumps({"event_id": event_id, "reading": record}, ensure_ascii=False, separators=(",", ":")).encode()
    timestamp = str(int(time.time()))
    signature = hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    try:
        request(url, "POST", data=body, max_response=64 * 1024, headers={
            "Content-Type": "application/json", "Idempotency-Key": event_id,
            "X-Abaulytics-Timestamp": timestamp, "X-Abaulytics-Signature": f"sha256={signature}",
        })
    except (OSError, ValueError) as error:
        if isinstance(error, HTTPError):
            error.close()
        delay = min(300, 2 ** min(delivery["attempts"], 9))
        with store.connection(write=True) as conn:
            conn.execute("UPDATE delivery SET attempts=attempts+1,next_attempt=? WHERE sample_id=? AND delivered_at IS NULL",
                         (time.time() + delay, record["id"]))
    else:
        with store.connection(write=True) as conn:
            conn.execute("UPDATE delivery SET attempts=attempts+1,delivered_at=? WHERE sample_id=? AND delivered_at IS NULL",
                         (utc(), record["id"]))
    return True


def webhook(args):
    url = service_url(os.environ["ABAULYTICS_WEBHOOK_URL"])
    secret = os.environ["ABAULYTICS_WEBHOOK_SECRET"]
    if len(secret) < 32 or secret in (os.getenv("ABAULYTICS_COLLECTOR_KEY"), os.getenv("ABAULYTICS_CORPORATE_KEY")):
        raise ValueError("Configure um segredo exclusivo do webhook, com pelo menos 32 caracteres.")
    store = get_store()
    while True:
        delivered = deliver_one(store, url, secret)
        if args.once:
            return
        if not delivered:
            time.sleep(0.5)


def calibrate(args):
    result = fit_calibration(args.manifest)
    with Path(args.output).open("x", encoding="utf-8") as output:
        output.write(result + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(required=True)
    setup = commands.add_parser("provision")
    setup.add_argument("badge")
    setup.add_argument("name")
    setup.add_argument("role", choices=ROLES)
    setup.set_defaults(run=provision)
    commands.add_parser("bench-calibration").set_defaults(run=bench_calibration)
    op = commands.add_parser("order")
    op.add_argument("number")
    op.add_argument("product")
    op.add_argument("width", type=float)
    op.add_argument("--url", default="http://127.0.0.1:8000")
    op.set_defaults(run=order)
    sim = commands.add_parser("simulate")
    sim.add_argument("--collector-url", default="http://127.0.0.1:8001")
    sim.add_argument("--count", type=int, default=100)
    sim.add_argument("--interval", type=float, default=0)
    sim.set_defaults(run=simulate)
    worker = commands.add_parser("webhook")
    worker.add_argument("--once", action="store_true")
    worker.set_defaults(run=webhook)
    target = commands.add_parser("calibrate")
    target.add_argument("manifest")
    target.add_argument("output")
    target.set_defaults(run=calibrate)
    args = parser.parse_args()
    try:
        args.run(args)
    except (HTTPException, OSError, ValueError, KeyError, sqlite3.Error) as error:
        parser.exit(1, f"{error}\n")


if __name__ == "__main__":
    main()
