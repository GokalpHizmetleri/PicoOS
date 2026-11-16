# PicoOS - minimal asyncio HTTP/1.1 server for MicroPython.
#
# Features: routing with simple path parameters, JSON helpers, streaming file
# responses, streaming request bodies straight to flash (for app uploads) and
# serving pre-gzipped assets that are frozen into the firmware.
import asyncio
import json

from . import compat
from .log import log

MIME = {
    "html": "text/html; charset=utf-8",
    "htm": "text/html; charset=utf-8",
    "css": "text/css; charset=utf-8",
    "js": "application/javascript; charset=utf-8",
    "mjs": "application/javascript; charset=utf-8",
    "json": "application/json",
    "txt": "text/plain; charset=utf-8",
    "md": "text/markdown; charset=utf-8",
    "svg": "image/svg+xml",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "webp": "image/webp",
    "ico": "image/x-icon",
    "wasm": "application/wasm",
    "woff": "font/woff",
    "woff2": "font/woff2",
    "ttf": "font/ttf",
    "mp3": "audio/mpeg",
    "wav": "audio/wav",
    "ogg": "audio/ogg",
    "mp4": "video/mp4",
    "webm": "video/webm",
    "xml": "application/xml",
    "csv": "text/csv",
    "webmanifest": "application/manifest+json",
}

STATUS = {
    200: "OK",
    201: "Created",
    204: "No Content",
    301: "Moved Permanently",
    302: "Found",
    304: "Not Modified",
    400: "Bad Request",
    404: "Not Found",
    405: "Method Not Allowed",
    409: "Conflict",
    413: "Payload Too Large",
    500: "Internal Server Error",
    503: "Service Unavailable",
    507: "Insufficient Storage",
}

MAX_HEADER_LINES = 40
MAX_JSON_BODY = 16 * 1024
CHUNK = 2048


def mime_for(name):
    i = name.rfind(".")
    if i < 0:
        return "application/octet-stream"
    return MIME.get(name[i + 1:].lower(), "application/octet-stream")


def unquote(s):
    if "%" not in s and "+" not in s:
        return s
    s = s.replace("+", " ")
    out = bytearray()
    i = 0
    b = s.encode()
    n = len(b)
    while i < n:
        c = b[i]
        if c == 37 and i + 2 < n:  # '%'
            try:
                out.append(int(b[i + 1:i + 3], 16))
                i += 3
                continue
            except ValueError:
                pass
        out.append(c)
        i += 1
    return out.decode()


def parse_qs(qs):
    out = {}
    if not qs:
        return out
    for part in qs.split("&"):
        if not part:
            continue
        if "=" in part:
            k, v = part.split("=", 1)
        else:
            k, v = part, ""
        out[unquote(k)] = unquote(v)
    return out


class Request:
    def __init__(self, reader, method, target, headers, client):
        self.reader = reader
        self.method = method
        self.headers = headers
        self.client = client
        if "?" in target:
            p, q = target.split("?", 1)
        else:
            p, q = target, ""
        self.path = unquote(p) or "/"
        self.query = parse_qs(q)
        self.params = {}
        self._body_read = False

    @property
    def content_length(self):
        try:
            return int(self.headers.get("content-length", "0"))
        except ValueError:
            return 0

    @property
    def host(self):
        return self.headers.get("host", "")

    async def body(self, limit=MAX_JSON_BODY):
        n = self.content_length
        if n > limit:
            raise ValueError("body too large")
        self._body_read = True
        if n <= 0:
            return b""
        return await self.reader.readexactly(n)

    async def json(self):
        data = await self.body()
        if not data:
            return {}
        return json.loads(data)

    async def save_body(self, dest_path, limit):
        """Stream the request body into a file without buffering it in RAM."""
        n = self.content_length
        if n > limit:
            raise ValueError("body too large")
        self._body_read = True
        remaining = n
        buf = bytearray(CHUNK)
        mv = memoryview(buf)
        with open(compat.path(dest_path), "wb") as f:
            while remaining > 0:
                want = CHUNK if remaining > CHUNK else remaining
                chunk = await self.reader.read(want)
                if not chunk:
                    raise OSError("connection closed")
                f.write(chunk)
                remaining -= len(chunk)
        del buf, mv
        return n


class Response:
    def __init__(self, writer):
        self.writer = writer
        self.sent = False

    async def send(self, status=200, body=b"", ctype="text/plain; charset=utf-8", headers=None):
        if isinstance(body, str):
            body = body.encode()
        await self.start(status, ctype, len(body), headers)
        if body:
            await self.write(body)

    async def start(self, status, ctype, length=None, headers=None):
        self.sent = True
        lines = "HTTP/1.1 %d %s\r\n" % (status, STATUS.get(status, "OK"))
        if ctype:
            lines += "Content-Type: %s\r\n" % ctype
        if length is not None:
            lines += "Content-Length: %d\r\n" % length
        lines += "Connection: close\r\n"
        if headers:
            for k in headers:
                lines += "%s: %s\r\n" % (k, headers[k])
        lines += "\r\n"
        self.writer.write(lines.encode())
        await self.writer.drain()

    async def write(self, data):
        self.writer.write(data)
        await self.writer.drain()

    async def json(self, obj, status=200, headers=None):
        await self.send(status, json.dumps(obj), "application/json", headers)

    async def error(self, status, message):
        await self.json({"ok": False, "error": message}, status)

    async def redirect(self, location, status=302):
        await self.send(status, b"", None, {"Location": location})

    async def file(self, fs_path, ctype=None, headers=None, gzip=False):
        """Stream a file from the filesystem."""
        try:
            size = compat.file_size(fs_path)
        except OSError:
            await self.error(404, "Not found")
            return
        h = {"Cache-Control": "no-cache"}
        if gzip:
            h["Content-Encoding"] = "gzip"
        if headers:
            h.update(headers)
        await self.start(200, ctype or mime_for(fs_path), size, h)
        buf = bytearray(CHUNK)
        with open(compat.path(fs_path), "rb") as f:
            while True:
                n = f.readinto(buf)
                if not n:
                    break
                self.writer.write(buf[:n] if n < CHUNK else buf)
                await self.writer.drain()

    async def asset(self, data, ctype, headers=None):
        """Send a pre-gzipped asset (bytes frozen in flash)."""
        h = {"Content-Encoding": "gzip", "Cache-Control": "no-cache"}
        if headers:
            h.update(headers)
        await self.start(200, ctype, len(data), h)
        mv = memoryview(data)
        for i in range(0, len(data), CHUNK):
            self.writer.write(mv[i:i + CHUNK])
            await self.writer.drain()


class Server:
    """A tiny router + asyncio stream server."""

    def __init__(self, name="http"):
        self.name = name
        self.routes = []  # (method, parts, handler)
        self.fallback = None
        self.server = None
        self.port = None

    def route(self, method, pattern):
        parts = pattern.strip("/").split("/") if pattern != "/" else []

        def deco(fn):
            self.routes.append((method, parts, fn))
            return fn

        return deco

    def add(self, method, pattern, fn):
        self.route(method, pattern)(fn)

    def _match(self, method, path):
        segs = path.strip("/").split("/") if path != "/" else []
        allowed = False
        for m, parts, fn in self.routes:
            params = {}
            if parts and parts[-1] == "*":
                if len(segs) < len(parts) - 1:
                    continue
                cmp_parts = parts[:-1]
                tail = "/".join(segs[len(parts) - 1:])
            else:
                if len(segs) != len(parts):
                    continue
                cmp_parts = parts
                tail = None
            ok = True
            for i in range(len(cmp_parts)):
                p = cmp_parts[i]
                if p and p[0] == ":":
                    params[p[1:]] = segs[i]
                elif p != segs[i]:
                    ok = False
                    break
            if not ok:
                continue
            if tail is not None:
                params["*"] = tail
            if m != method and m != "*":
                allowed = True
                continue
            return fn, params, False
        return None, None, allowed

    async def _handle(self, reader, writer):
        res = Response(writer)
        try:
            try:
                peer = writer.get_extra_info("peername")
                client = peer[0] if peer else ""
            except Exception:
                client = ""
            line = await asyncio.wait_for(reader.readline(), 10)
            if not line:
                return
            try:
                method, target, _ = line.decode().split(" ", 2)
            except ValueError:
                return
            headers = {}
            for _ in range(MAX_HEADER_LINES):
                h = await asyncio.wait_for(reader.readline(), 10)
                if not h or h == b"\r\n":
                    break
                try:
                    k, v = h.decode().split(":", 1)
                    headers[k.strip().lower()] = v.strip()
                except ValueError:
                    pass
            req = Request(reader, method.upper(), target, headers, client)
            await self.dispatch(req, res)
        except Exception as e:  # noqa: BLE001 - never let one request kill the server
            try:
                log(self.name, "error:", repr(e))
                if not res.sent:
                    await res.error(500, str(e) or repr(e))
            except Exception:
                pass
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    async def dispatch(self, req, res):
        """Route an already-parsed request (also used to forward requests)."""
        if req.method == "OPTIONS":
            await res.send(204, b"", None, {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            })
            return
        method = "GET" if req.method == "HEAD" else req.method
        fn, params, allowed = self._match(method, req.path)
        if fn is None:
            if self.fallback is not None:
                await self.fallback(req, res)
            elif allowed:
                await res.error(405, "Method not allowed")
            else:
                await res.error(404, "Not found")
            return
        req.params = params
        await fn(req, res)

    async def start(self, port, host="0.0.0.0"):
        self.port = port
        self.server = await asyncio.start_server(self._handle, host, port, backlog=4)
        return self.server

    async def stop(self):
        """Close the listening socket and wait until the port is free again."""
        srv = self.server
        self.server = None
        if srv is None:
            return
        try:
            srv.close()
            await srv.wait_closed()
        except BaseException:  # CancelledError on MicroPython
            pass
        await compat.sleep_ms(50)
