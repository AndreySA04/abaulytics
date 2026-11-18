"""Compare both measurement methods on the same set of local photographs."""

import argparse
import csv
import json
import math
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from statistics import median, stdev

from .industrial_store import micrometers
from .main import HTTPException, MAX_FILE_BYTES, cv2, decode_image, measure_sheet, np


@dataclass
class Capture:
    group: str
    reference: float | None
    previous: float | None
    current: float | None


def previous_measurement(image, width_mm):
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    top = np.argmax(mask, axis=0)
    columns = np.flatnonzero(mask[top, np.arange(mask.shape[1])])
    if len(columns) < 50:
        return None
    amplitude_px = np.ptp(top[columns])
    return round(float(amplitude_px) * width_mm / int(columns[-1] - columns[0]), 2)


def capture_results(manifest):
    with manifest.open(encoding="utf-8-sig", newline="") as file:
        rows = csv.DictReader(file)
        fields = {"arquivo", "grupo", "largura_nominal_mm", "flecha_referencia_mm"}
        if not fields.issubset(rows.fieldnames or ()):
            raise ValueError("O CSV deve incluir " + ", ".join(sorted(fields)))

        for row in rows:
            try:
                path = manifest.parent / row["arquivo"].strip()
                group = row["grupo"].strip()
                width = float(row["largura_nominal_mm"])
                reference = row["flecha_referencia_mm"].strip()
                reference = float(reference) if reference else None
                if not 0 < width <= 100_000:
                    raise ValueError("largura nominal fora do intervalo permitido")
                if reference is not None and (not group or not math.isfinite(reference) or reference < 0):
                    raise ValueError("informe o grupo e uma flecha de referência válida")
                suffixes = {".jpeg": "image/jpeg", ".jpg": "image/jpeg", ".png": "image/png"}
                mime = suffixes.get(path.suffix.lower())
                if mime is None:
                    raise ValueError("use um arquivo JPEG ou PNG")
                with path.open("rb") as photo:
                    data = photo.read(MAX_FILE_BYTES + 1)
            except (AttributeError, OSError, TypeError, ValueError) as error:
                raise ValueError(f"Linha {rows.line_num}: {error}") from error

            previous = current = None
            if len(data) <= MAX_FILE_BYTES:
                try:
                    image = decode_image(data, mime)
                    previous = previous_measurement(image, width)
                    amplitude_px, chord_px, _ = measure_sheet(image, allow_front_view=False)
                    current = micrometers(amplitude_px * width / chord_px) / 1000
                except HTTPException as error:
                    if error.status_code not in (415, 422):
                        raise
            yield Capture(group, reference, previous, current)


def summary(valid, invalid, paired, method):
    accepted = [capture for capture in valid if getattr(capture, method) is not None]
    accepted_invalid = sum(getattr(capture, method) is not None for capture in invalid)
    errors_by_group = defaultdict(list)
    for capture in accepted:
        errors_by_group[capture.group].append(getattr(capture, method) - capture.reference)
    deviations = [stdev(errors) for errors in errors_by_group.values() if len(errors) > 1]
    paired_errors = [abs(getattr(capture, method) - capture.reference) for capture in paired]
    total = len(valid) + len(invalid)

    return {
        "validas_aceitas": len(accepted),
        "invalidas_aceitas": accepted_invalid,
        "taxa_recaptura": (total - len(accepted) - accepted_invalid) / total,
        "erro_absoluto_medio_pareado_mm": float(np.mean(paired_errors)) if paired_errors else None,
        "p95_erro_absoluto_pareado_mm": float(np.percentile(paired_errors, 95)) if paired_errors else None,
        "grupos_com_repeticoes_aceitas": len(deviations),
        "mediana_desvio_padrao_repeticoes_mm": median(deviations) if deviations else None,
    }


def compare(manifest):
    captures = list(capture_results(manifest))
    if not captures:
        raise ValueError("O CSV deve conter pelo menos uma captura.")
    valid = [capture for capture in captures if capture.reference is not None]
    invalid = [capture for capture in captures if capture.reference is None]
    paired = [capture for capture in valid if capture.previous is not None and capture.current is not None]
    previous = summary(valid, invalid, paired, "previous")
    current = summary(valid, invalid, paired, "current")
    improved = (
        bool(paired)
        and current["validas_aceitas"] >= previous["validas_aceitas"]
        and current["invalidas_aceitas"] < previous["invalidas_aceitas"]
        and current["erro_absoluto_medio_pareado_mm"] < previous["erro_absoluto_medio_pareado_mm"]
        and current["p95_erro_absoluto_pareado_mm"] < previous["p95_erro_absoluto_pareado_mm"]
    )
    return {
        "capturas_validas": len(valid),
        "capturas_invalidas": len(invalid),
        "capturas_validas_aceitas_pelos_dois": len(paired),
        "pico_vale": previous,
        "flecha_perfil_v1": current,
        "criterios_de_adocao_atendidos": improved,
    }


def main():
    parser = argparse.ArgumentParser(
        description="Compara o método de pico e vale com a flecha de perfil em fotos locais.",
        epilog=("Use um CSV UTF-8 com o cabeçalho arquivo,grupo,largura_nominal_mm,flecha_referencia_mm. "
                "Meça a flecha perpendicular à reta entre as pontas da mesma borda, na mesma posição de apoio. "
                "Agrupe as fotos repetidas da mesma chapa e posição com o mesmo identificador. "
                "Deixe a referência vazia apenas para fotos classificadas previamente como inválidas."),
    )
    parser.add_argument("manifesto", type=Path)
    args = parser.parse_args()
    try:
        report = compare(args.manifesto)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
