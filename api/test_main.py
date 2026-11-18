import asyncio
import io
import json
import unittest
from unittest.mock import patch

import cv2
import numpy as np
from PIL import Image
from main import app, MAX_BODY_BYTES, slots


async def request(body, content_type="multipart/form-data; boundary=testing", headers=None, chunks=None):
    messages = []
    incoming = list(chunks or [{"type": "http.request", "body": body, "more_body": False}])
    async def receive():
        return incoming.pop(0) if incoming else {"type": "http.disconnect"}
    async def send(message):
        messages.append(message)
    scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
             "method": "POST", "scheme": "http", "path": "/api/analisar-chapa",
             "raw_path": b"/api/analisar-chapa", "query_string": b"",
             "headers": [(b"content-type", content_type.encode())] + list(headers or []),
             "client": ("127.0.0.1", 10000), "server": ("test", 80)}
    await app(scope, receive, send)
    status = next(m["status"] for m in messages if m["type"] == "http.response.start")
    payload = b"".join(m.get("body", b"") for m in messages if m["type"] == "http.response.body")
    return status, json.loads(payload)


def multipart(image, width="500", mime="image/png"):
    body = (b"--testing\r\nContent-Disposition: form-data; name=\"file\"; filename=\"chapa.png\"\r\n"
            + b"Content-Type: " + mime.encode() + b"\r\n\r\n" + image)
    if width is not None:
        body += (b"\r\n--testing\r\nContent-Disposition: form-data; name=\"largura_real_mm\"\r\n\r\n"
                 + width.encode())
    return body + b"\r\n--testing--\r\n"


def sheet_photo(profile=None, angle=0, background=255, sheet=0, half_thickness=9):
    x = np.arange(60, 401)
    offsets = np.zeros_like(x) if profile is None else np.rint(profile(np.linspace(0, 1, len(x)))).astype(int)
    y = 120 + offsets
    upper = np.column_stack((x, y - half_thickness))
    lower = np.column_stack((x, y + half_thickness))[::-1]
    polygon = np.concatenate((upper, lower)).astype(np.int32)
    img = np.full((240, 460, 3), background, dtype=np.uint8)
    cv2.fillPoly(img, [polygon], (sheet,) * 3)
    if angle:
        transform = cv2.getRotationMatrix2D((230, 120), angle, 1)
        img = cv2.warpAffine(img, transform, (460, 240), borderValue=(background,) * 3)
    return img


def front_photo(deflection, *, rounded=False, angle=0):
    x = np.arange(145, 506)
    u = np.linspace(-1, 1, len(x))
    curve = np.sqrt(1 - u ** 2) if rounded else 1 - u ** 2
    upper = np.column_stack((x, np.rint(248 - deflection * curve)))
    polygon = np.vstack((upper, [[505, 570], [145, 570]])).astype(np.int32)
    photo = np.full((700, 650, 3), 255, dtype=np.uint8)
    cv2.fillPoly(photo, [polygon], (40, 83, 130))
    if angle:
        rotation = cv2.getRotationMatrix2D((325, 350), angle, 1)
        photo = cv2.warpAffine(photo, rotation, (650, 700), borderValue=(255, 255, 255))
    return photo


class AnalysisTests(unittest.TestCase):
    def setUp(self):
        self.image = cv2.imencode(".png", sheet_photo())[1].tobytes()

    def call(self, image=None, width="500", mime="image/png"):
        return asyncio.run(request(multipart(self.image if image is None else image, width, mime)))

    def call_photo(self, photo, width="500"):
        return self.call(cv2.imencode(".png", photo)[1].tobytes(), width=width)

    def assert_profile_rejected(self, photo):
        status, result = self.call_photo(photo)
        self.assertEqual(status, 422, result)
        self.assertIn("Refaça a foto", result["erro"])
        self.assertNotIn("abaulamento_mm", result)

    def test_success_and_no_disk_writes(self):
        with patch("cv2.imwrite", side_effect=AssertionError("No image persistence")), patch("sqlite3.connect", side_effect=AssertionError("No DB persistence")):
            status, result = self.call()
        self.assertEqual(status, 200)
        self.assertEqual(result["status"], "sucesso")
        self.assertEqual(result["abaulamento_px"], 0)
        self.assertEqual(result["abaulamento_mm"], 0)
        self.assertEqual(result["metodo_medicao"], "flecha_perfil_v1")
        self.assertIsInstance(result["id_medicao"], str)
        self.assertTrue(result["data"].endswith("+00:00"))

    def test_known_profile_in_both_directions_and_s_shape(self):
        cases = {
            "up": lambda t: -120 * t * (1 - t),
            "down": lambda t: 120 * t * (1 - t),
            "S": lambda t: 30 * np.sin(2 * np.pi * t),
        }
        for name, profile in cases.items():
            with self.subTest(profile=name):
                status, result = self.call_photo(sheet_photo(profile))
                self.assertEqual(status, 200, result)
                self.assertAlmostEqual(result["abaulamento_px"], 30, delta=1)

    def test_rotated_bow_and_nominal_width_scaling(self):
        photo = sheet_photo(lambda t: 120 * t * (1 - t), angle=-7)
        status, result = self.call_photo(photo)
        self.assertEqual(status, 200, result)
        self.assertAlmostEqual(result["abaulamento_px"], 30, delta=1)
        self.assertAlmostEqual(result["abaulamento_mm"], 30 * 500 / 340, delta=500 / 340)
        status, doubled = self.call_photo(photo, "1000")
        self.assertEqual(status, 200, doubled)
        self.assertEqual(doubled["abaulamento_px"], result["abaulamento_px"])
        single_cents = round(result["abaulamento_mm"] * 100)
        double_cents = round(doubled["abaulamento_mm"] * 100)
        self.assertLessEqual(abs(double_cents - 2 * single_cents), 1)

    def test_peak_near_tip_of_rotated_profile(self):
        def profile(t):
            return 600 * t * (1 - t) ** 7

        for angle, half_thickness in [(-10, 16), (-15, 9), (15, 9)]:
            with self.subTest(angle=angle, half_thickness=half_thickness):
                status, result = self.call_photo(sheet_photo(profile, angle=angle, half_thickness=half_thickness))
                self.assertEqual(status, 200, result)
                self.assertAlmostEqual(result["abaulamento_px"], profile(1 / 8), delta=1)

    def test_flat_profile_stays_flat_when_rotated(self):
        for angle in [-12, 5, 12]:
            with self.subTest(angle=angle):
                status, result = self.call_photo(sheet_photo(angle=angle))
                self.assertEqual(status, 200, result)
                self.assertLessEqual(result["abaulamento_px"], 1)

    def test_light_sheet_over_dark_background(self):
        photo = sheet_photo(lambda t: 120 * t * (1 - t), background=35, sheet=190, half_thickness=2)
        status, result = self.call_photo(photo)
        self.assertEqual(status, 200, result)
        self.assertAlmostEqual(result["abaulamento_px"], 30, delta=1)

    def test_jpeg_capture_with_small_deflection(self):
        photo = sheet_photo(lambda t: -16 * t * (1 - t), angle=5, background=225, sheet=85)
        image = cv2.imencode(".jpg", photo, [cv2.IMWRITE_JPEG_QUALITY, 70])[1].tobytes()
        status, result = self.call(image, mime="image/jpeg")
        self.assertEqual(status, 200, result)
        self.assertAlmostEqual(result["abaulamento_px"], 4, delta=1)

    def test_brown_front_contour_on_white_background(self):
        for deflection in [60, -45, 0]:
            with self.subTest(deflection=deflection):
                status, result = self.call_photo(front_photo(deflection))
                self.assertEqual(status, 200, result)
                self.assertEqual(result["metodo_medicao"], "flecha_contorno_v1")
                self.assertAlmostEqual(result["abaulamento_px"], abs(deflection), delta=2)
                self.assertAlmostEqual(result["abaulamento_mm"], abs(deflection) * 500 / 360, delta=500 / 180)

    def test_rounded_front_contour_in_rotated_jpeg(self):
        photo = front_photo(180, rounded=True, angle=10)
        data = cv2.imencode(".jpg", photo, [cv2.IMWRITE_JPEG_QUALITY, 70])[1].tobytes()
        status, result = self.call(data, mime="image/jpeg")
        self.assertEqual(status, 200, result)
        self.assertEqual(result["metodo_medicao"], "flecha_contorno_v1")
        self.assertAlmostEqual(result["abaulamento_px"], 180, delta=6)

    def test_thin_horizontal_mark_does_not_expand_front_contour(self):
        photo = front_photo(60)
        cv2.line(photo, (0, 380), (649, 380), (0, 0, 0), 1)
        status, result = self.call_photo(photo)
        self.assertEqual(status, 200, result)
        self.assertEqual(result["metodo_medicao"], "flecha_contorno_v1")
        self.assertAlmostEqual(result["abaulamento_px"], 60, delta=2)

    def test_distant_front_contour_off_center_and_on_screen(self):
        picture = cv2.resize(front_photo(60), (390, 420), interpolation=cv2.INTER_AREA)
        for background in (255, 42):
            with self.subTest(background=background):
                photo = np.full((1120, 860, 3), background, dtype=np.uint8)
                photo[125:545, 60:450] = picture
                data = cv2.imencode(".jpg", photo, [cv2.IMWRITE_JPEG_QUALITY, 70])[1].tobytes()
                status, result = self.call(data, mime="image/jpeg")
                self.assertEqual(status, 200, result)
                self.assertEqual(result["metodo_medicao"], "flecha_contorno_v1")
                self.assertAlmostEqual(result["abaulamento_mm"], 500 * 60 / 360, delta=5)

    def test_front_contour_with_shadow_touching_frame(self):
        y, x = np.mgrid[:700, :650]
        light = 1 - 0.45 * np.exp(-((x - 110) ** 2 + (y - 300) ** 2) / (2 * 90 ** 2))
        photo = (front_photo(60) * light[:, :, None]).astype(np.uint8)
        status, result = self.call_photo(photo)
        self.assertEqual(status, 200, result)
        self.assertEqual(result["metodo_medicao"], "flecha_contorno_v1")
        self.assertAlmostEqual(result["abaulamento_mm"], 500 * 60 / 360, delta=5)

    def test_front_contour_with_perspective_and_camera_roll(self):
        corners = np.float32([[0, 0], [649, 0], [649, 699], [0, 699]])
        perspective = cv2.getPerspectiveTransform(corners, np.float32([[40, 50], [620, 5], [605, 690], [60, 635]]))
        x = np.arange(145, 506)
        y = 248 - 60 * (1 - np.linspace(-1, 1, len(x)) ** 2)
        projected = cv2.perspectiveTransform(np.column_stack((x, y))[None, :, :], perspective)[0]
        dx, dy = projected[-1] - projected[0]
        displacement = projected - projected[0]
        projected_mm = 500 * np.max(np.abs(dx * displacement[:, 1] - dy * displacement[:, 0])) / (dx ** 2 + dy ** 2)

        for photo, expected in [
            (cv2.warpPerspective(front_photo(60), perspective, (650, 700), borderValue=(255, 255, 255)), projected_mm),
            (front_photo(60, angle=25), 500 * 60 / 360),
        ]:
            with self.subTest(expected=expected):
                status, result = self.call_photo(photo)
                self.assertEqual(status, 200, result)
                self.assertEqual(result["metodo_medicao"], "flecha_contorno_v1")
                self.assertAlmostEqual(result["abaulamento_mm"], expected, delta=5)

    def test_front_contour_with_narrow_visible_margin(self):
        status, result = self.call_photo(front_photo(60)[:, 144:507].copy())
        self.assertEqual(status, 200, result)
        self.assertEqual(result["metodo_medicao"], "flecha_contorno_v1")
        self.assertAlmostEqual(result["abaulamento_px"], 60, delta=2)

    def test_background_stain_and_single_profile_spike(self):
        photo = sheet_photo()
        cv2.rectangle(photo, (20, 45), (42, 70), (0, 0, 0), -1)
        cv2.line(photo, (230, 95), (230, 111), (0, 0, 0), 1)
        status, result = self.call_photo(photo)
        self.assertEqual(status, 200, result)
        self.assertLessEqual(result["abaulamento_px"], 1)

    def test_unreliable_profiles_are_rejected(self):
        interrupted = sheet_photo()
        interrupted[:, 226:233] = 255
        interrupted_near_tip = sheet_photo()
        interrupted_near_tip[:, 118:124] = 255
        ambiguous = sheet_photo()
        cv2.rectangle(ambiguous, (60, 70), (400, 78), (0, 0, 0), -1)
        clipped = sheet_photo()[:, 61:].copy()
        round_object = np.full((700, 650, 3), 255, dtype=np.uint8)
        cv2.circle(round_object, (325, 350), 180, (40, 83, 130), -1)
        for name, photo in {
            "black background alone": np.zeros((240, 460, 3), dtype=np.uint8),
            "low contrast": sheet_photo(background=200, sheet=190),
            "blurred": cv2.GaussianBlur(sheet_photo(), (0, 0), sigmaX=10),
            "interrupted": interrupted,
            "interrupted near the tip": interrupted_near_tip,
            "ambiguous": ambiguous,
            "clipped": clipped,
            "round object": round_object,
            "clipped front view": front_photo(60)[:, 150:].copy(),
        }.items():
            with self.subTest(photo=name):
                self.assert_profile_rejected(photo)

    def test_invalid_widths(self):
        for width in [None, "", "0", "-1", "nan", "inf", "100001", "text"]:
            with self.subTest(width=width):
                status, _ = self.call(width=width)
                self.assertEqual(status, 422)

    def test_invalid_and_forged_images(self):
        for image, mime, expected in [(b"not an image", "image/png", 422), (self.image, "text/plain", 415), (self.image, "image/jpeg", 415)]:
            self.assertEqual(self.call(image, mime=mime)[0], expected)

    def test_dimensions_and_missing_profile(self):
        image = Image.new("RGB", (9000, 50), "white")
        buffer = io.BytesIO(); image.save(buffer, format="PNG")
        self.assertEqual(self.call(buffer.getvalue())[0], 422)
        blank = np.full((100, 100, 3), 255, np.uint8)
        self.assertEqual(self.call(cv2.imencode(".png", blank)[1].tobytes())[0], 422)

    def test_request_limits_before_multipart(self):
        status, _ = asyncio.run(request(b"", headers=[(b"content-length", str(MAX_BODY_BYTES + 1).encode())]))
        self.assertEqual(status, 413)
        chunks = [{"type": "http.request", "body": b"x" * (MAX_BODY_BYTES // 2 + 1), "more_body": True}] * 2
        self.assertEqual(asyncio.run(request(b"", chunks=chunks))[0], 413)

    def test_busy_and_generic_errors(self):
        slots.acquire(); slots.acquire()
        try:
            self.assertEqual(self.call()[0], 503)
        finally:
            slots.release(); slots.release()
        with patch("cv2.cvtColor", side_effect=RuntimeError("private-path-secret")):
            status, result = self.call()
        self.assertEqual(status, 500)
        self.assertNotIn("private-path-secret", json.dumps(result))

    def test_missing_file(self):
        status, _ = asyncio.run(request(b"--testing--\r\n"))
        self.assertEqual(status, 422)


if __name__ == "__main__":
    unittest.main()
