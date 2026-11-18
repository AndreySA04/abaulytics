"""Stereo images with a known, one-dimensional deflection for bench testing."""

import cv2
import numpy as np

from .industrial_store import utc


MATRIX = [[800, 0, 320], [0, 800, 240], [0, 0, 1]]
IDENTITY = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
BENCH_CALIBRATION = {
    "width": 640, "height": 480, "left_matrix": MATRIX, "right_matrix": MATRIX,
    "left_distortion": [0] * 5, "right_distortion": [0] * 5, "rotation": IDENTITY,
    "translation_mm": [0, 8, 0], "fixture_rotation": IDENTITY,
    "target_error_px": 0, "capture_skew_ms": 1,
}


def stereo_images(deflection_mm, *, slope=0, background=234, sheet=65):
    columns = np.arange(65, 576)
    position = np.linspace(0, 1, len(columns))
    edge = 212 + slope * (position - 0.5) - 8 * deflection_mm * 4 * position * (1 - position)
    rows = np.arange(480).reshape(-1, 1)
    pair = []
    for shift in (0, 64):
        image = np.full((480, 640), background, dtype=np.uint8)
        covered = np.clip(1 + rows - (edge + shift), 0, 1) - np.clip(1 + rows - (edge + shift + 14), 0, 1)
        image[:, columns] = np.rint(background - covered * (background - sheet)).astype(np.uint8)
        pair.append(("image/png", cv2.imencode(".png", image)[1].tobytes()))
    return pair


def synthetic_capture(lot, observed_at, sequence):
    if lot["calibration_id"] != "bancada-estereo":
        raise ValueError("O simulador exige a calibração de bancada.")
    return utc(), stereo_images(8 if sequence % 100 else 16), None
