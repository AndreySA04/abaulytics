"""Bounded HTTP transport for the collectors and corporate adapter."""

import json
import uuid
from urllib.error import HTTPError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


opener = build_opener(ProxyHandler({}), NoRedirects())


def service_url(value):
    url = urlsplit(value)
    if (not url.hostname or url.username or url.password or url.query or url.fragment
            or not (url.scheme == "https" or url.scheme == "http" and url.hostname in ("localhost", "127.0.0.1", "::1"))):
        raise ValueError("Use HTTPS para a comunicação de serviço. HTTP é aceito somente em loopback.")
    return value.rstrip("/")


def request(url, method, *, token=None, data=None, headers=None, timeout=3, max_response=3 * 1024 * 1024):
    headers = dict(headers or {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if isinstance(data, dict):
        data = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
        headers["Content-Type"] = "application/json"
    try:
        with opener.open(Request(url, data=data, headers=headers, method=method), timeout=timeout) as response:
            body = response.read(max_response + 1)
            if len(body) > max_response:
                raise ValueError("Resposta excedeu o limite da integração.")
            return body
    except HTTPError as error:
        error.close()
        raise


def multipart(values, images):
    boundary = uuid.uuid4().hex
    body = bytearray()
    for name, value in values.items():
        if value is not None:
            body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    if images:
        for name, (mime, frame) in zip(("left", "right"), images):
            body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{name}"\r\n'
                        f'Content-Type: {mime}\r\n\r\n'.encode())
            body.extend(frame)
            body.extend(b"\r\n")
    body.extend(f"--{boundary}--\r\n".encode())
    return body, {"Content-Type": f"multipart/form-data; boundary={boundary}"}
