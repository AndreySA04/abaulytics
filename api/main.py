import io
import math
import os
import threading
import uuid
import warnings
from time import perf_counter
from datetime import datetime, timezone

# Bound OpenCV's decoder before importing it; Pillow inspects dimensions first.
os.environ.setdefault("OPENCV_IO_MAX_IMAGE_PIXELS", "16000000")
import cv2
import numpy as np
from PIL import Image, UnidentifiedImageError
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from api.industrial_store import micrometers

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024
MAX_PIXELS = 16_000_000
MAX_DIMENSION = 8192
MIN_PROFILE_WIDTH_PX = 50
MIN_PROFILE_WIDTH_RATIO = 0.45
MIN_FRONT_WIDTH_RATIO = 0.15
MAX_PROFILE_THICKNESS_RATIO = 0.15
MIN_EDGE_CONTRAST = 16
PROFILE_MEASUREMENT_METHOD = "flecha_perfil_v1"
CONTOUR_MEASUREMENT_METHOD = "flecha_contorno_v1"
BENCH_LIMIT_UM = 12_000  # E2 RN01/RN02
BENCH_WARNING_UM = BENCH_LIMIT_UM - 200  # Use the E2 RNF01 error limit as a bench warning band.
slots = threading.BoundedSemaphore(2)
collector_slots = threading.BoundedSemaphore(2)
COLLECTOR_MAX_BODY_BYTES = 2 * MAX_FILE_BYTES + 64 * 1024


class BoundedAnalysisMiddleware:
    """Limit the entire request before multipart parsing; bound in-flight memory per worker."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST":
            return await self.app(scope, receive, send)
        path = scope["path"]
        if path not in ("/api/analisar-chapa", "/v1/collector/samples"):
            return await self.app(scope, receive, send)
        industrial = path == "/v1/collector/samples"
        capacity = collector_slots if industrial else slots
        max_body = COLLECTOR_MAX_BODY_BYTES if industrial else MAX_BODY_BYTES
        if not capacity.acquire(blocking=False):
            return await JSONResponse({"erro": "Serviço ocupado. Tente novamente."}, status_code=503,
                                      headers={"Retry-After": "2"})(scope, receive, send)
        try:
            headers = dict(scope.get("headers", []))
            length = headers.get(b"content-length")
            if length is not None:
                try:
                    if int(length) < 0:
                        raise ValueError()
                    if int(length) > max_body:
                        return await JSONResponse({"erro": "Upload excede o limite."}, status_code=413)(scope, receive, send)
                except ValueError:
                    return await JSONResponse({"erro": "Requisição inválida."}, status_code=400)(scope, receive, send)
            body = bytearray()
            while True:
                message = await receive()
                if message["type"] == "http.disconnect":
                    return
                chunk = message.get("body", b"")
                if len(body) + len(chunk) > max_body:
                    return await JSONResponse({"erro": "Upload excede o limite."}, status_code=413)(scope, receive, send)
                body.extend(chunk)
                if not message.get("more_body", False):
                    break
            delivered = False
            async def replay():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": bytes(body), "more_body": False}
                return await receive()
            await self.app(scope, replay, send)
        finally:
            capacity.release()


app = FastAPI()
origins = [value.strip() for value in os.getenv("CORS_ORIGINS", "").split(",") if value.strip()]
if "*" in origins:
    raise RuntimeError("CORS_ORIGINS must list explicit origins")
app.add_middleware(BoundedAnalysisMiddleware)
app.add_middleware(
    CORSMiddleware, allow_origins=origins, allow_credentials=False,
    allow_methods=["GET", "POST", "PUT"], allow_headers=["Content-Type", "Authorization"],
    expose_headers=["Server-Timing", "Content-Disposition"],
)


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return JSONResponse({"erro": exc.detail}, status_code=exc.status_code, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    message = ("Arquivo e largura devem ser válidos." if request.url.path == "/api/analisar-chapa"
               else "Revise os campos enviados, incluindo os formatos de data e hora.")
    return JSONResponse({"erro": message}, status_code=422)


def decode_image(contents: bytes, content_type: str | None):
    if content_type not in ("image/jpeg", "image/png"):
        raise HTTPException(415, "Envie uma imagem JPEG ou PNG.")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(contents)) as header:
                width, height = header.size
                if header.format not in ("JPEG", "PNG"):
                    raise HTTPException(415, "Formato de imagem não permitido.")
                expected = "image/jpeg" if header.format == "JPEG" else "image/png"
                if content_type != expected:
                    raise HTTPException(415, "Formato e tipo de imagem não correspondem.")
                if min(width, height) < 50 or max(width, height) > MAX_DIMENSION or width * height > MAX_PIXELS:
                    raise HTTPException(422, "Dimensões de imagem não permitidas.")
                header.verify()
        img = cv2.imdecode(np.frombuffer(contents, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(422, "Imagem inválida.")
        return img
    except HTTPException:
        raise
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError,
            Image.DecompressionBombError, Image.DecompressionBombWarning, cv2.error):
        raise HTTPException(422, "Imagem inválida.") from None


def profile_endpoint(centerline, thickness):
    """Locate the tip at half the local thickness of the silhouette's end cap."""
    span = len(centerline)
    sample_count = max(16, round(span * 0.08))
    local_thickness = np.median(thickness[sample_count // 2:sample_count])
    half_thickness = 0.5 * local_thickness
    tip_column = int(np.flatnonzero(thickness[:sample_count] >= half_thickness)[0])
    tip = float(tip_column)
    if tip_column > 0:
        before, after = thickness[tip_column - 1:tip_column + 1]
        tip = tip_column - 1 + (half_thickness - before) / (after - before)

    full_sections = np.flatnonzero(thickness[:sample_count] >= 0.95 * local_thickness)
    if len(full_sections) < 2:
        raise HTTPException(422, "Refaça a foto com as duas pontas da borda bem visíveis.")
    # Fit only the neighborhood of the tip so a curved profile can reach the end cap.
    first_section = int(full_sections[1])
    fit_count = min(max(24, round(span * 0.01)), max(8, span // 9))
    fit_columns = np.arange(first_section, first_section + fit_count)
    fit = np.polyfit(fit_columns, centerline[fit_columns], 2)
    return tip, float(np.polyval(fit, tip)), first_section


def interpolate_profile_edge(gray, columns, rows, contrast, background, direction):
    """Interpolate where the edge reaches half the local foreground contrast."""
    target = 0.5 * np.abs(contrast)
    offsets = direction * np.arange(-1, 8)[:, None]
    sample_rows = np.clip(rows + offsets, 0, gray.shape[0] - 1)
    samples = (gray[sample_rows, columns].astype(np.float64) - background) * np.sign(contrast)
    crossing = np.argmax(samples >= target, axis=0)
    indices = np.arange(len(columns))
    before = samples[np.maximum(0, crossing - 1), indices]
    after = samples[crossing, indices]
    fraction = np.divide(target - before, after - before, out=np.zeros_like(target), where=after > before)
    adjustment = np.where(crossing > 0, crossing - 2 + fraction, 0)
    return rows + direction * adjustment


def has_clear_profile_edges(gray, x, y, top, bottom):
    margin = len(top) // 10
    columns = np.arange(margin, len(top) - margin)
    top_rows = y + top[columns]
    bottom_rows = y + bottom[columns]
    step = max(2, min(6, round(len(top) / 750)))
    inside_step = np.minimum(step, (bottom_rows - top_rows) // 2)
    photo_columns = x + columns
    above = gray[np.maximum(0, top_rows - step), photo_columns].astype(np.int16)
    below = gray[np.minimum(gray.shape[0] - 1, bottom_rows + step), photo_columns].astype(np.int16)
    top_inside = gray[top_rows + inside_step, photo_columns]
    bottom_inside = gray[bottom_rows - inside_step, photo_columns]
    top_contrast = np.median(np.abs(top_inside - above))
    bottom_contrast = np.median(np.abs(bottom_inside - below))
    return min(top_contrast, bottom_contrast) >= MIN_EDGE_CONTRAST


def has_adjacent_profile_fragment(contours, x, y, centerline, typical_thickness):
    span = len(centerline)
    max_gap = max(4, round(span * 0.04))
    min_fragment_width = max(8, round(span * 0.03))
    height_tolerance = max(4, typical_thickness)
    for contour in contours:
        fragment_x, fragment_y, fragment_width, fragment_height = cv2.boundingRect(contour)
        if fragment_width < max(min_fragment_width, fragment_height):
            continue
        if 0 <= x - (fragment_x + fragment_width) <= max_gap:
            tip_y = y + centerline[0]
        elif 0 <= fragment_x - (x + span) <= max_gap:
            tip_y = y + centerline[-1]
        else:
            continue
        if fragment_y - height_tolerance <= tip_y <= fragment_y + fragment_height + height_tolerance:
            return True
    return False


def find_sheet_candidates(contours, width, height, *, front_view=False):
    min_ratio = MIN_FRONT_WIDTH_RATIO if front_view else MIN_PROFILE_WIDTH_RATIO
    min_width = max(MIN_PROFILE_WIDTH_PX, width * min_ratio)
    candidates = []
    for contour in contours:
        x, y, span, depth = cv2.boundingRect(contour)
        center_x, center_y = x + span / 2, y + depth / 2
        if front_view:
            in_frame = width / 8 <= center_x <= 7 * width / 8 and height / 8 <= center_y <= 7 * height / 8
        else:
            in_frame = x <= width / 2 < x + span and height / 4 <= center_y <= 3 * height / 4
        if span < min_width or not in_frame:
            continue
        area = cv2.contourArea(contour)
        lateral = area <= MAX_PROFILE_THICKNESS_RATIO * span ** 2
        if front_view and not lateral and area >= 0.55 * span * depth and depth <= 2 * span:
            candidates.append((contour, x, y, span, depth))
        if not front_view and lateral:
            candidates.append((contour, x, y, span, depth))
    return candidates


def find_front_candidates(distance_from_background, mask, threshold):
    height, width = mask.shape
    otsu, _ = cv2.threshold(distance_from_background, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    front_threshold = max(MIN_EDGE_CONTRAST - 1, min(threshold, otsu))
    size = max(3, min(21, 2 * (height // 350) + 1))
    kernel = np.ones((size, size), dtype=np.uint8)
    # A lower cutoff can recover parts of a solid sheet lit unevenly. Opening removes thin marks.
    lower_threshold = max(MIN_EDGE_CONTRAST - 1, 0.45 * front_threshold)
    cutoffs = (front_threshold, lower_threshold) if lower_threshold < front_threshold else (front_threshold,)
    for cutoff in cutoffs:
        _, mask = cv2.threshold(distance_from_background, cutoff, 255, cv2.THRESH_BINARY, dst=mask)
        cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, dst=mask)
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        candidates = find_sheet_candidates(contours, width, height, front_view=True)
        if candidates:
            return candidates
    return []


def find_brown_contours(img):
    """Locate cardboard by color when a screen, paper or shadow dominates the contrast mask."""
    height, width = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, (0, 50, 20), (40, 255, 255))
    size = max(3, min(21, 2 * (height // 350) + 1))
    bridge = max(3, min(35, 2 * (height // 180) + 1))
    cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((bridge, 1), dtype=np.uint8), dst=mask)
    cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((size, size), dtype=np.uint8), dst=mask)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    return find_sheet_candidates(contours, width, height, front_view=True)


def front_candidates(img, distance_from_background, mask, threshold):
    candidates = find_front_candidates(distance_from_background, mask, threshold)
    brown_candidates = find_brown_contours(img)
    if not candidates:
        return brown_candidates
    if brown_candidates and len(candidates) == 1:
        _, x, y, width, height = candidates[0]
        margin = max(2, round(0.025 * min(width, height)))
        # The rectangular contrast contour may be a white page or display around the actual sheet.
        enclosed = [candidate for candidate in brown_candidates
                    if x + margin <= candidate[1] and candidate[1] + candidate[3] <= x + width - margin
                    and y + margin <= candidate[2] and candidate[2] + candidate[4] <= y + height - margin]
        if enclosed:
            return enclosed

        image_height, image_width = mask.shape
        touches_frame = x == 0 or y == 0 or x + width == image_width or y + height == image_height
        if touches_frame and len(brown_candidates) == 1:
            _, bx, by, bw, bh = brown_candidates[0]
            brown_complete = 0 < bx and bx + bw < image_width and 0 < by and by + bh < image_height
            if brown_complete and bh >= 0.65 * height:
                return brown_candidates
    return candidates


def profile_deflection(sections, line, left_x, left_y, right_x, right_y):
    span = right_x - left_x
    radius = max(2, min(10, round(span * 0.002)))
    windows = np.lib.stride_tricks.sliding_window_view(np.pad(line, radius, mode="edge"), 2 * radius + 1)
    smoothed = np.median(windows, axis=1)
    rise = right_y - left_y
    chord_px = math.hypot(span, rise)
    signed_distances = (span * (smoothed - left_y) - rise * (sections - left_x)) / chord_px
    return float(np.max(np.abs(signed_distances))), chord_px


def front_corner(upper, trim):
    columns = np.arange(trim, trim + max(8, round(len(upper) * 0.05)))
    edge_rows = upper[columns]
    # A rounded top can meet its side nearly vertically. Fitting in sqrt(x) follows that turn.
    if abs(edge_rows[-1] - edge_rows[0]) > 0.6 * (columns[-1] - columns[0]):
        columns = np.arange(trim, trim + max(8, round(len(upper) * 0.075)))
        edge_rows = upper[columns]
        columns = np.sqrt(columns)
    return float(np.polyfit(columns, edge_rows, 2)[-1])


def measure_front_contour(contour, silhouette):
    """Measure the upper outline in the image plane of a front-facing sheet."""
    depth, span = silhouette.shape
    base_margin = round(span * 0.30)
    base_columns = np.arange(base_margin, span - base_margin)
    lower_edge = depth - 1 - np.argmax(silhouette[::-1, base_margin:-base_margin], axis=0)
    base = np.column_stack((base_columns, lower_edge)).astype(np.float32)
    vx, vy, base_x, base_y = cv2.fitLine(base, cv2.DIST_HUBER, 0, 0.01, 0.01).ravel()
    angle = math.atan2(float(vy), float(vx))
    straightness = np.abs((base_columns - base_x) * vy - (lower_edge - base_y) * vx)
    framing_error = "Refaça a foto de frente, com a borda a medir no topo e a base e as laterais visíveis."
    if abs(angle) > math.radians(30) or np.percentile(straightness, 90) > max(2, 0.018 * span):
        raise HTTPException(422, framing_error)

    # Rotate the outline into the axes of the sheet's base to keep the side walls out of the upper profile.
    cos, sin = math.cos(angle), math.sin(angle)
    rotation = np.array(((cos, -sin), (sin, cos)))
    points = np.rint(contour.reshape(-1, 2) @ rotation).astype(np.int32)
    points -= points.min(axis=0)
    aligned_width, aligned_height = points.max(axis=0) + 1
    aligned = np.zeros((aligned_height, aligned_width), dtype=np.uint8)
    cv2.fillPoly(aligned, [points], 1)

    rows = np.arange(round(aligned_height * 0.55), round(aligned_height * 0.85))
    side_rows = aligned[rows[0]:rows[-1] + 1]
    left_side = np.argmax(side_rows, axis=1)
    right_side = aligned_width - 1 - np.argmax(side_rows[:, ::-1], axis=1)
    left_wall = np.polyfit(rows, left_side, 1)
    right_wall = np.polyfit(rows, right_side, 1)
    wall_error = np.maximum(np.abs(left_side - np.polyval(left_wall, rows)),
                            np.abs(right_side - np.polyval(right_wall, rows)))
    wall_drift = max(abs(left_wall[0]), abs(right_wall[0])) * aligned_height
    if np.percentile(wall_error, 90) > max(2, 0.015 * aligned_width) or wall_drift > 0.18 * aligned_width:
        raise HTTPException(422, framing_error)

    left_x, right_x = round(np.median(left_side)), round(np.median(right_side))
    width = right_x - left_x + 1
    if wall_drift > 0.015 * aligned_width and width >= MIN_PROFILE_WIDTH_PX:
        # Map the visible outline between its side walls, then recover original image coordinates for measurement.
        edge_x, edge_y = points.T
        left = np.polyval(left_wall, edge_y)
        right = np.polyval(right_wall, edge_y)
        if np.min(right - left) < 0.65 * width:
            raise HTTPException(422, framing_error)
        corrected_x = (edge_x - left) * (width - 1) / (right - left)
        corrected = np.column_stack((np.rint(np.clip(corrected_x, 0, width - 1)), edge_y)).astype(np.int32)
        aligned = np.zeros((aligned_height, width), dtype=np.uint8)
        cv2.fillPoly(aligned, [corrected], 1)
        left_x, right_x = 0, width - 1
        rectified = True
    else:
        rectified = False

    upper = np.argmax(aligned[:, left_x:right_x + 1], axis=0)
    if len(upper) < MIN_PROFILE_WIDTH_PX:
        raise HTTPException(422, framing_error)

    # Fit the ends just inside the sides, where the silhouette tracks the upper edge.
    trim = max(1, round(len(upper) * 0.01))
    left_y = front_corner(upper, trim)
    right_y = front_corner(upper[::-1], trim)
    sections = np.arange(trim, len(upper) - trim)
    if rectified:
        line = upper[sections]
        left = np.polyval(left_wall, line)
        right = np.polyval(right_wall, line)
        image_x = left + (right - left) * sections / (width - 1)
        return profile_deflection(image_x, line, np.polyval(left_wall, left_y), left_y,
                                  np.polyval(right_wall, right_y), right_y)
    return profile_deflection(sections, upper[sections], 0, left_y, len(upper) - 1, right_y)


def measure_sheet(img, *, allow_front_view=True):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    height, width = gray.shape
    border = np.concatenate((gray[0], gray[-1], gray[1:-1, 0], gray[1:-1, -1])).astype(np.float32)
    background = int(round(float(np.median(border))))
    background_variation = np.median(np.abs(border - background))
    distance_from_background = cv2.absdiff(gray, background)
    threshold = max(MIN_EDGE_CONTRAST - 1, 5 * background_variation)
    _, mask = cv2.threshold(distance_from_background, threshold, 255, cv2.THRESH_BINARY)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    candidates = find_sheet_candidates(contours, width, height)
    method = PROFILE_MEASUREMENT_METHOD
    if allow_front_view and not candidates:
        candidates = front_candidates(img, distance_from_background, mask, threshold)
        method = CONTOUR_MEASUREMENT_METHOD

    if not candidates:
        raise HTTPException(422, "Refaça a foto aproximando a câmera, com a chapa inteira visível e um fundo contrastante.")
    if len(candidates) > 1:
        raise HTTPException(422, "Mais de uma chapa foi encontrada. Refaça a foto com apenas uma chapa no enquadramento.")

    contour, x, y, span, depth = candidates[0]
    x_margin = 1 if method == CONTOUR_MEASUREMENT_METHOD else max(2, round(width * 0.02))
    y_margin = 1 if method == CONTOUR_MEASUREMENT_METHOD else max(2, round(height * 0.02))
    if x < x_margin or x + span > width - x_margin or y < y_margin or y + depth > height - y_margin:
        raise HTTPException(422, "Refaça a foto deixando margem em torno da chapa e mantendo as duas pontas visíveis.")

    silhouette = np.zeros((depth, span), dtype=np.uint8)
    cv2.drawContours(silhouette, [contour], -1, 1, cv2.FILLED, offset=(-x, -y))
    if method == CONTOUR_MEASUREMENT_METHOD:
        amplitude_px, chord_px = measure_front_contour(contour, silhouette)
        return amplitude_px, chord_px, method

    top = np.argmax(silhouette, axis=0)
    bottom = depth - 1 - np.argmax(silhouette[::-1], axis=0)
    thickness = bottom - top + 1
    thin, typical_thickness, thick = np.percentile(thickness, (10, 50, 90))
    if typical_thickness < 2 or thin < 0.5 * typical_thickness or thick > 2 * typical_thickness:
        raise HTTPException(422, "Refaça a foto com a borda inteira visível, sem sombras ou objetos sobre a chapa.")
    if not has_clear_profile_edges(gray, x, y, top, bottom):
        raise HTTPException(422, "Refaça a foto com foco na borda da chapa e um fundo contrastante.")

    columns = x + np.arange(span)
    foreground = gray[y + (top + bottom) // 2, columns].astype(np.float64)
    contrast = foreground - background
    top_edge = interpolate_profile_edge(gray, columns, y + top, contrast, background, 1)
    bottom_edge = interpolate_profile_edge(gray, columns, y + bottom, contrast, background, -1)
    centerline = (top_edge + bottom_edge) / 2 - y
    if has_adjacent_profile_fragment(contours, x, y, centerline, typical_thickness):
        raise HTTPException(422, "O perfil parece interrompido. Refaça a foto com a borda inteira visível.")
    refined_thickness = bottom_edge - top_edge
    left_x, left_y, first_section = profile_endpoint(centerline, refined_thickness)
    right_offset, right_y, last_offset = profile_endpoint(centerline[::-1], refined_thickness[::-1])
    right_x = span - 1 - right_offset
    sections = np.arange(first_section, span - last_offset)
    # Ignore the end caps, where a column intersects only part of the profile's thickness.
    amplitude_px, chord_px = profile_deflection(sections, centerline[sections], left_x, left_y, right_x, right_y)
    return amplitude_px, chord_px, method


def classify_bench_measurement(deflection_um):
    if deflection_um > BENCH_LIMIT_UM:
        return "critico"
    if deflection_um >= BENCH_WARNING_UM:
        return "atencao"
    return "sucesso"


@app.post("/api/analisar-chapa")
def analisar_chapa(response: Response, file: UploadFile = File(...), largura_real_mm: float = Form(...)):
    started = perf_counter()
    try:
        width_mm = largura_real_mm
        if not math.isfinite(width_mm) or not 0 < width_mm <= 100_000:
            raise HTTPException(422, "A largura deve ser positiva, finita e de até 100000 mm.")
        contents = file.file.read(MAX_FILE_BYTES + 1)
        if len(contents) > MAX_FILE_BYTES:
            raise HTTPException(413, "Imagem excede o limite de 10 MiB.")
        img = decode_image(contents, file.content_type)
        decoded = perf_counter()

        amplitude_px, chord_px, method = measure_sheet(img)
        amplitude_um = micrometers(amplitude_px * width_mm / chord_px)
        response.headers['Server-Timing'] = (
            f'decode;dur={(decoded - started) * 1000:.1f}, '
            f'profile;dur={(perf_counter() - decoded) * 1000:.1f}'
        )
        # No server persistence: IDs are now UUID strings, and timestamps explicitly use UTC.
        return {
            "status": "sucesso", "id_medicao": uuid.uuid4().hex,
            "data": datetime.now(timezone.utc).isoformat(),
            "abaulamento_px": round(amplitude_px, 3), "abaulamento_mm": amplitude_um / 1000,
            "classificacao": classify_bench_measurement(amplitude_um),
            "metodo_medicao": method,
        }
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "Falha no processamento da imagem.") from None
    finally:
        file.file.close()


from api.industrial import router as industrial_router

app.include_router(industrial_router)
