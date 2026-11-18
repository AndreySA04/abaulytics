"""Summarize metrology, dashboard latency and availability for an observed shift."""

import argparse
import csv
import json
import math
from datetime import datetime

from .industrial import get_store
from .industrial_store import utc


def when(value):
    result = datetime.fromisoformat(value)
    if result.tzinfo is None:
        raise ValueError("Todos os horários precisam incluir fuso.")
    return result


def csv_rows(path):
    with open(path, encoding="utf-8-sig", newline="") as file:
        return list(csv.DictReader(file))


def availability(start, end, outages):
    intervals = sorted((when(row["start"]), when(row["end"])) for row in outages)
    if end <= start or any(not start <= left < right <= end for left, right in intervals):
        raise ValueError("Informe um período produtivo válido e interrupções dentro dele.")
    downtime = 0.0
    previous_end = start
    for left, right in intervals:
        if right > previous_end:
            downtime += (right - max(left, previous_end)).total_seconds()
            previous_end = right
    return 100 * (1 - downtime / (end - start).total_seconds())


def qualify(store, start, end, observer, references, outages):
    available = availability(start, end, outages)
    with store.connection() as conn:
        sample_rows = conn.execute("""
            SELECT id,deflection_um FROM sample WHERE classification IS NOT NULL AND captured_at>=? AND captured_at<?
        """, (utc(start), utc(end))).fetchall()
        readings = {row["id"]: row["deflection_um"] / 1000 for row in sample_rows}
        telemetry = conn.execute("""
            SELECT a.detail FROM audit a JOIN audit_actor aa ON aa.audit_id=a.id
            JOIN account u ON u.id=aa.account_id WHERE u.badge=? AND a.action='leitura_renderizada'
            AND a.at>=? ORDER BY a.id
        """, (observer, utc(start))).fetchall()
    render_ms = {}
    for row in telemetry:
        item = json.loads(row["detail"])
        if item["sample_id"] in readings:
            render_ms.setdefault(item["sample_id"], item["capture_to_view_ms"])
    valid_ms = [ms for ms in render_ms.values() if ms >= 0]
    missing = len(readings) - len(valid_ms)
    max_ms = max(valid_ms, default=None)

    absolute_errors = []
    reference_ids = set()
    for row in references:
        sample_id, reference = int(row["sample_id"]), float(row["reference_mm"])
        if sample_id in reference_ids or not math.isfinite(reference) or reference < 0 or sample_id not in readings:
            raise ValueError("Cada referência precisa indicar uma leitura válida e única do período.")
        reference_ids.add(sample_id)
        absolute_errors.append(abs(reference - readings[sample_id]))
    max_error = round(max(absolute_errors), 6) if absolute_errors else None
    return {
        "ambiente": store.mode,
        "leituras_validas": len(readings), "leituras_sem_renderizacao_valida": missing,
        "max_captura_tela_ms": max_ms, "limite_2s_atendido": missing == 0 and max_ms is not None and max_ms <= 2000,
        "referencias_fisicas": len(absolute_errors), "erro_absoluto_maximo_mm": max_error,
        "limite_0_20mm_atendido": max_error is not None and max_error <= 0.20,
        "disponibilidade_percentual": round(available, 4), "limite_95pct_atendido": available >= 95,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", required=True, type=when)
    parser.add_argument("--end", required=True, type=when)
    parser.add_argument("--observer", required=True, help="Crachá usado no dashboard de homologação.")
    parser.add_argument("--references", required=True, help="CSV com sample_id,reference_mm.")
    parser.add_argument("--outages", required=True, help="CSV com start,end para cada interrupção observada.")
    args = parser.parse_args()
    result = qualify(get_store(), args.start, args.end, args.observer,
                     csv_rows(args.references), csv_rows(args.outages))
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
