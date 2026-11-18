"""Triangulate matching points of one sheet edge in a calibrated vertical stereo pair."""

import io
from functools import lru_cache

import cv2
import numpy as np
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field

from .industrial_store import micrometers


STEREO_METHOD = "estereo_vertical_v1"
MAX_IMAGE_BYTES = 10 * 1024 * 1024
METHODS = {STEREO_METHOD: (1.5, 5), "estereo_vertical_v2": (1.0, 3)}
FORMATS = {"image/jpeg": "JPEG", "image/png": "PNG"}


class Calibration(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")
    width: int = Field(ge=640, le=8192)
    height: int = Field(ge=480, le=8192)
    left_matrix: list[list[float]]
    right_matrix: list[list[float]]
    left_distortion: list[float]
    right_distortion: list[float]
    rotation: list[list[float]]
    translation_mm: list[float]
    fixture_rotation: list[list[float]]
    target_error_px: float = Field(ge=0, le=1)
    capture_skew_ms: float = Field(gt=0, le=10)


def _rotation(value):
    matrix = np.asarray(value, dtype=np.float64)
    if matrix.shape != (3, 3) or not np.allclose(matrix.T @ matrix, np.eye(3), atol=0.001) or not np.isclose(np.linalg.det(matrix), 1, atol=0.001):
        raise ValueError("Matriz de rotação inválida.")
    return matrix


@lru_cache(maxsize=2)
def rectification(serialized):
    c = Calibration.model_validate_json(serialized)
    if c.width * c.height > 16_000_000:
        raise ValueError("A resolução calibrada excede 16 megapixels.")
    left, right = (np.asarray(matrix, dtype=np.float64) for matrix in (c.left_matrix, c.right_matrix))
    for matrix in (left, right):
        if matrix.shape != (3, 3) or min(matrix[0, 0], matrix[1, 1]) <= 0 or not np.allclose(matrix[2], [0, 0, 1]):
            raise ValueError("Matriz intrínseca inválida.")
    if any(len(coefficients) not in (4, 5, 8, 12, 14) for coefficients in (c.left_distortion, c.right_distortion)):
        raise ValueError("Coeficientes de distorção inválidos.")
    distort_left = np.asarray(c.left_distortion)
    distort_right = np.asarray(c.right_distortion)
    translation = np.asarray(c.translation_mm, dtype=np.float64)
    if translation.shape != (3,) or abs(translation[1]) <= max(abs(translation[0]), abs(translation[2]), 1):
        raise ValueError("A montagem deve ter base estéreo predominantemente vertical.")
    size = (c.width, c.height)
    r1, r2, p1, p2, _, _, _ = cv2.stereoRectify(
        left, distort_left, right, distort_right, size, _rotation(c.rotation), translation.reshape(3, 1),
        flags=cv2.CALIB_ZERO_DISPARITY, alpha=0,
    )
    if abs(p2[1, 3]) <= abs(p2[0, 3]):
        raise ValueError("As epipolares retificadas devem cruzar a borda verticalmente na imagem.")
    left_maps = cv2.initUndistortRectifyMap(left, distort_left, r1, p1, size, cv2.CV_16SC2)
    right_maps = cv2.initUndistortRectifyMap(right, distort_right, r2, p2, size, cv2.CV_16SC2)
    return p1, p2, r1 @ _rotation(c.fixture_rotation), left_maps, right_maps


def decode_view(mime, data, calibration):
    if mime not in FORMATS or not data or len(data) > MAX_IMAGE_BYTES:
        raise ValueError("Use vistas JPEG ou PNG de até 10 MiB.")
    try:
        with Image.open(io.BytesIO(data)) as header:
            size = (calibration.width, calibration.height)
            if header.format != FORMATS[mime] or header.size != size:
                raise ValueError("Cada vista deve ter o formato e a resolução da calibração (mínimo 480p).")
            header.verify()
        pixels = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_GRAYSCALE | cv2.IMREAD_IGNORE_ORIENTATION)
    except (OSError, SyntaxError, cv2.error) as error:
        raise ValueError("Imagem corrompida.") from error
    if pixels is None or pixels.shape != size[::-1]:
        raise ValueError("Imagem corrompida.")
    return pixels


def _edge(pixels, maps):
    gray = cv2.remap(pixels, *maps, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    height, width = gray.shape
    border = np.concatenate((gray[0], gray[-1], gray[:, 0], gray[:, -1])).astype(np.float32)
    background = float(np.median(border))
    threshold = max(15, 5 * float(np.median(abs(border - background))))
    distance = np.abs(gray.astype(np.float32) - background)
    mask = (distance > threshold).astype(np.uint8)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = []
    for contour in contours:
        x, y, span, depth = cv2.boundingRect(contour)
        if span >= width * 0.45 and x < width / 2 < x + span and cv2.contourArea(contour) > span:
            candidates.append((contour, x, y, span, depth))
    if len(candidates) != 1:
        raise ValueError("O enquadramento precisa conter uma única borda contínua.")
    contour, x, y, span, depth = candidates[0]
    if x < 3 or y < 3 or x + span > width - 3 or y + depth > height - 3:
        raise ValueError("As extremidades da borda precisam estar no quadro.")
    contour_mask = np.zeros((depth, span), dtype=np.uint8)
    cv2.drawContours(contour_mask, [contour], 0, 1, cv2.FILLED, offset=(-x, -y))
    if not np.all(contour_mask.any(axis=0)):
        raise ValueError("A borda está interrompida.")
    first = x + np.arange(span)
    top = y + np.argmax(contour_mask, axis=0)
    inside = distance[top, first]
    outside = distance[top - 1, first]
    delta = inside - outside
    if np.percentile(delta, 20) < 2:
        raise ValueError("A borda não está suficientemente nítida.")
    crossing = np.clip((threshold - outside) / np.maximum(delta, 0.01), 0, 1)
    return first, top - 1 + crossing


def measure_pair(pair, parameters, method):
    max_projection_error, smoothing_window = METHODS[method]
    calibration = Calibration.model_validate(parameters)
    p1, p2, fixture, left_maps, right_maps = rectification(calibration.model_dump_json())
    edges = [_edge(decode_view(*frame, calibration), maps) for frame, maps in zip(pair, (left_maps, right_maps))]
    (lx, ly), (rx, ry) = edges
    start, end = max(lx[0], rx[0]), min(lx[-1], rx[-1]) + 1
    span = end - start
    if span < 0.97 * max(len(lx), len(rx)):
        raise ValueError("As duas vistas precisam cobrir toda a largura da borda.")
    columns = np.arange(start, end, dtype=np.float64)
    observations = [np.vstack((columns, rows[start - xs[0]:end - xs[0]])) for xs, rows in edges]
    homogeneous = cv2.triangulatePoints(p1, p2, *observations)
    if np.any(np.abs(homogeneous[3]) < 1e-9):
        raise ValueError("Par estéreo geometricamente degenerado.")
    points = homogeneous[:3] / homogeneous[3]
    if np.any(points[2] <= 0) or not np.isfinite(points).all():
        raise ValueError("Profundidade inválida.")
    world = fixture.T @ points
    for projection, expected in zip((p1, p2), observations):
        projected = projection @ np.vstack((points, np.ones(span)))
        error = np.linalg.norm(projected[:2] / projected[2] - expected, axis=0)
        if float(np.max(error)) > max_projection_error:
            raise ValueError("Correspondência estéreo inválida.")
    width, vertical = world[:2]
    if width[-1] < width[0]:
        width, vertical = width[::-1], vertical[::-1]
    if np.any(np.diff(width) <= 0):
        raise ValueError("A borda não forma um perfil contínuo no eixo de largura.")
    padded = np.pad(vertical, smoothing_window // 2, mode="edge")
    vertical = np.median(np.lib.stride_tricks.sliding_window_view(padded, smoothing_window), axis=1)
    reference = vertical[0] + (vertical[-1] - vertical[0]) * (width - width[0]) / (width[-1] - width[0])
    return micrometers(float(np.max(np.abs(vertical - reference))))
