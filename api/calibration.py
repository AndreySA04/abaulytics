"""Fit the industrial stereo rig from synchronized chessboard photographs."""

import json
from pathlib import Path

import cv2
import numpy as np

from .stereo import Calibration, rectification


def fit_calibration(manifest):
    path = Path(manifest)
    data = json.loads(path.read_text(encoding="utf-8"))
    columns, rows = (int(data[key]) for key in ("columns", "rows"))
    spacing = float(data["square_mm"])
    pairs = data["pairs"]
    if not (3 <= columns <= 20 and 3 <= rows <= 20 and 0.1 <= spacing <= 1000 and 8 <= len(pairs) <= 100):
        raise ValueError("Informe entre 8 e 100 pares e as dimensões válidas do tabuleiro.")
    grid = np.zeros((rows * columns, 3), np.float32)
    grid[:, :2] = np.mgrid[0:columns, 0:rows].T.reshape(-1, 2) * spacing
    targets, left_corners, right_corners = [], [], []
    size = None
    for left, right in pairs:
        detected = []
        for filename in (left, right):
            pixels = cv2.imread(str(path.parent / filename), cv2.IMREAD_GRAYSCALE)
            if pixels is None:
                raise ValueError(f"Não foi possível abrir {filename}.")
            if size is None:
                size = pixels.shape[::-1]
            if pixels.shape[::-1] != size:
                raise ValueError("Todas as vistas precisam ter a mesma resolução.")
            found, corners = cv2.findChessboardCornersSB(pixels, (columns, rows))
            if not found:
                raise ValueError(f"Tabuleiro incompleto em {filename}.")
            corners = corners.reshape(rows, columns, 2)
            # Define the fixture axes by increasing column and row in the image.
            if corners[0, 0, 0] > corners[0, -1, 0]:
                corners = corners[:, ::-1]
            if corners[0, 0, 1] > corners[-1, 0, 1]:
                corners = corners[::-1]
            detected.append(np.ascontiguousarray(corners.reshape(-1, 1, 2), dtype=np.float32))
        targets.append(grid)
        left_corners.append(detected[0])
        right_corners.append(detected[1])
    left_error, left, d_left, rvecs, _ = cv2.calibrateCamera(targets, left_corners, size, None, None)
    right_error, right, d_right, _, _ = cv2.calibrateCamera(targets, right_corners, size, None, None)
    error, left, d_left, right, d_right, rotation, translation, _, _ = cv2.stereoCalibrate(
        targets, left_corners, right_corners, left, d_left, right, d_right, size, flags=cv2.CALIB_FIX_INTRINSIC,
    )
    fixture, _ = cv2.Rodrigues(rvecs[0])
    calibration = Calibration(
        width=size[0], height=size[1], left_matrix=left.tolist(), right_matrix=right.tolist(),
        left_distortion=d_left.ravel().tolist(), right_distortion=d_right.ravel().tolist(),
        rotation=rotation.tolist(), translation_mm=translation.ravel().tolist(), fixture_rotation=fixture.tolist(),
        target_error_px=max(error, left_error, right_error), capture_skew_ms=data["capture_skew_ms"],
    )
    serialized = calibration.model_dump_json(indent=2)
    rectification(calibration.model_dump_json())
    return serialized
