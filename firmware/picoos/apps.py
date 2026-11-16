# PicoOS - app manager.
#
# Every installed app lives in /apps/<id>/:
#   app.json  - metadata (name, icon, port, version, source, ...)
#   www/      - the static HTML/CSS/JS files that are served on the app's port
#   data/     - per-app key/value storage used by the PicoOS app SDK
#
# Each enabled app gets its own HTTP server on its own port (8081, 8082, ...),
# so http://pico.local:<port>/ opens the app. The same files are also served
# from the dashboard port at /apps/<id>/ as a fallback.
import json
import time

from . import compat, config, sysinfo, timesvc
from .http import Server, mime_for
from .log import log

APPS_DIR = "/apps"
STAGING_DIR = "/apps/.staging"
FIRST_PORT = 8081
MAX_APPS = 20
LAST_PORT = FIRST_PORT + MAX_APPS - 1
BLOCK = 4096          # LittleFS block size
RESERVE = 64 * 1024   # always keep this much flash free for config/logs
DATA_LIMIT = 32 * 1024
HIDDEN = ("app.json",)

# GPIOs an app may drive through the SDK (23, 24, 25 and 29 belong to the Wi-Fi chip).
SAFE_GPIO = tuple(range(0, 23)) + (26, 27, 28)

hosts = {}   # id -> AppHost
_pins = {}


def valid_id(app_id):
    if not app_id or len(app_id) > 32 or app_id[0] in "-_.":
        return False
    for c in app_id:
        if not (("a" <= c <= "z") or ("0" <= c <= "9") or c in "-_"):
            return False
    return True


def safe_rel(rel):
    """Validate a relative file path inside an app. Returns cleaned path or None."""
    rel = rel.replace("\\", "/").lstrip("/")
    if not rel or len(rel) > 128:
        return None
    parts = rel.split("/")
    for p in parts:
        if not p or p in (".", ".."):
            return None
    if parts[0] in (".git", ".picoos"):
        return None
    return "/".join(parts)


def _base_prefix(bp):
    """'/repo-name/' for sites built for GitHub Pages project URLs, else ''."""
    bp = str(bp or "")
    if not bp.startswith("/") or not bp.endswith("/") or len(bp) > 64 or bp == "/" or ".." in bp:
        return ""
    return bp


def disk_cost(size):
    """Approximate flash usage of a file of `size` bytes on LittleFS."""
    return ((size + BLOCK - 1) // BLOCK + 1) * BLOCK


def app_dir(app_id):
    return APPS_DIR + "/" + app_id


def meta(app_id):
    return compat.read_json(app_dir(app_id) + "/app.json")


def installed_ids():
    out = []
    for name in compat.listdir(APPS_DIR):
        if name.startswith("."):
            continue
        if compat.exists(APPS_DIR + "/" + name + "/app.json"):
            out.append(name)
    return out


def describe(app_id):
    m = meta(app_id)
    if not m:
        return None
    m = dict(m)
    m["id"] = app_id
    m["size"] = compat.tree_size(app_dir(app_id))
    h = hosts.get(app_id)
    m["running"] = bool(h and h.server.server)
    m["has_icon_file"] = _icon_file(m) is not None
    return m


def list_apps():
    out = []
    for app_id in installed_ids():
        d = describe(app_id)
        if d:
            out.append(d)
    out.sort(key=lambda a: a.get("installed_at", 0))
    return out


def _icon_file(m):
    icon = m.get("icon") or ""
    rel = safe_rel(icon) if "." in icon else None
    if rel and compat.exists(app_dir(m["id"]) + "/www/" + rel):
        return app_dir(m["id"]) + "/www/" + rel
    return None


def icon_path(app_id):
    m = meta(app_id)
    if not m:
        return None
    m["id"] = app_id
    return _icon_file(m)


def used_ports():
    ports = []
    for app_id in installed_ids():
        m = meta(app_id) or {}
        if m.get("port"):
            ports.append(m["port"])
    return ports


def free_port():
    used = used_ports()
    for p in range(FIRST_PORT, LAST_PORT + 1):
        if p not in used:
            return p
    return None


# ---------------------------------------------------------------- install


def install_begin(info):
    app_id = info.get("id", "")
    if not valid_id(app_id):
        raise ValueError("Invalid app id (use a-z, 0-9, - and _)")
    exists = compat.exists(app_dir(app_id) + "/app.json")
    if not exists and len(installed_ids()) >= MAX_APPS:
        raise ValueError("App limit reached (%d apps)" % MAX_APPS)
    need = int(info.get("size", 0) or 0)
    files = int(info.get("files", 1) or 1)
    est = need + files * BLOCK * 2
    total, free = compat.statvfs()
    if exists:
        free += compat.tree_size(app_dir(app_id) + "/www")
    if est + RESERVE > free:
        raise MemoryError("Not enough storage: needs ~%d KB, %d KB free" % (est // 1024, max(0, free - RESERVE) // 1024))
    stage = STAGING_DIR + "/" + app_id
    compat.rmtree(stage)
    compat.makedirs(stage + "/www")
    m = {
        "id": app_id,
        "name": (info.get("name") or app_id)[:40],
        "version": str(info.get("version") or "1.0.0")[:16],
        "description": (info.get("description") or "")[:300],
        "author": (info.get("author") or "")[:60],
        "icon": (info.get("icon") or "")[:128],
        "color": (info.get("color") or "")[:16],
        "category": (info.get("category") or "Utilities")[:24],
        "entry": safe_rel(info.get("entry") or "index.html") or "index.html",
        "backend": safe_rel(info.get("backend") or "") or "",
        "spa": bool(info.get("spa", False)),
        "source": (info.get("source") or "upload")[:16],
        "repo": (info.get("repo") or "")[:120],
        "homepage": (info.get("homepage") or "")[:200],
        "license": (info.get("license") or "")[:32],
        "internet": bool(info.get("internet", False)),
        "base_prefix": _base_prefix(info.get("base_prefix")),
    }
    compat.write_json(stage + "/app.json", m)
    log("Installing app", app_id)
    return m


async def install_file(req, app_id, rel):
    if not valid_id(app_id):
        raise ValueError("Invalid app id")
    rel = safe_rel(rel)
    if rel is None:
        raise ValueError("Invalid file path")
    stage = STAGING_DIR + "/" + app_id
    if not compat.exists(stage + "/app.json"):
        raise ValueError("Call install/begin first")
    total, free = compat.statvfs()
    if disk_cost(req.content_length) + RESERVE > free:
        raise MemoryError("Not enough storage for %s" % rel)
    dest = stage + "/www/" + rel
    if "/" in rel:
        compat.makedirs(dest[:dest.rfind("/")])
    await req.save_body(dest, free - RESERVE)
    return rel


async def install_commit(app_id):
    import os
    stage = STAGING_DIR + "/" + app_id
    m = compat.read_json(stage + "/app.json")
    if not m:
        raise ValueError("Nothing staged for " + app_id)
    if not compat.exists(stage + "/www/" + m["entry"]):
        # Fall back to the first .html file uploaded.
        html = [n for n in compat.listdir(stage + "/www") if n.endswith(".html") or n.endswith(".htm")]
        if not html:
            raise ValueError("App has no %s" % m["entry"])
        m["entry"] = html[0]
    dest = app_dir(app_id)
    old = meta(app_id)
    await stop_app(app_id)
    if old:
        m["port"] = old.get("port")
        m["installed_at"] = old.get("installed_at", time.time())
        m["enabled"] = old.get("enabled", True)
        if compat.exists(dest + "/data"):
            os.rename(compat.path(dest + "/data"), compat.path(stage + "/data"))
        compat.rmtree(dest)
    else:
        m["installed_at"] = time.time()
        m["enabled"] = True
    if not m.get("port"):
        m["port"] = free_port()
    m["updated_at"] = time.time()
    compat.write_json(stage + "/app.json", m)
    os.rename(compat.path(stage), compat.path(dest))
    log("Installed %s v%s on port %s" % (app_id, m["version"], m["port"]))
    if m.get("enabled", True):
        await start_app(app_id)
    return describe(app_id)


def install_abort(app_id):
    if valid_id(app_id):
        compat.rmtree(STAGING_DIR + "/" + app_id)


async def uninstall(app_id):
    if not valid_id(app_id) or not compat.exists(app_dir(app_id)):
        raise ValueError("App not found")
    await stop_app(app_id)
    compat.rmtree(app_dir(app_id))
    log("Uninstalled", app_id)


async def set_enabled(app_id, enabled):
    m = meta(app_id)
    if not m:
        raise ValueError("App not found")
    m["enabled"] = bool(enabled)
    compat.write_json(app_dir(app_id) + "/app.json", m)
    if enabled:
        await start_app(app_id)
    else:
        await stop_app(app_id)
    return describe(app_id)


# ---------------------------------------------------------------- hosting


class SDK:
    """Object handed to an app's optional Python backend."""

    def __init__(self, app_id):
        self.app_id = app_id

    def get(self, key, default=None):
        k = _safe_key(key)
        if not k:
            return default
        try:
            with open(compat.path(app_dir(self.app_id) + "/data/" + k), "rb") as f:
                return json.loads(f.read())
        except (OSError, ValueError):
            return default

    def set(self, key, value):
        k = _safe_key(key)
        if not k:
            raise ValueError("bad key")
        compat.makedirs(app_dir(self.app_id) + "/data")
        data = json.dumps(value)
        if len(data) > DATA_LIMIT:
            raise ValueError("value too large")
        with open(compat.path(app_dir(self.app_id) + "/data/" + k), "w") as f:
            f.write(data)

    def led(self, on=None):
        return _led(on)

    def log(self, *args):
        log("[%s]" % self.app_id, *args)

    def time(self):
        return timesvc.snapshot()

    def system(self):
        return sysinfo.snapshot()


def _safe_key(key):
    if not key or len(key) > 48:
        return None
    for c in key:
        if not (c.isalpha() or c.isdigit() or c in "-_."):
            return None
    if key.startswith("."):
        return None
    return key


def _led(on=None):
    try:
        import machine
        pin = _pins.get("LED")
        if pin is None:
            pin = machine.Pin("LED", machine.Pin.OUT)
            _pins["LED"] = pin
        if on == "toggle":
            pin.value(0 if pin.value() else 1)
        elif on is not None:
            pin.value(1 if on else 0)
        return bool(pin.value())
    except Exception:
        st = _pins.get("_led_sim", False)
        if on == "toggle":
            st = not st
        elif on is not None:
            st = bool(on)
        _pins["_led_sim"] = st
        return st


def _gpio(pin_no, mode=None, value=None, pull=None):
    import machine
    if pin_no not in SAFE_GPIO:
        raise ValueError("GPIO %d is not available to apps" % pin_no)
    key = "GP%d" % pin_no
    pin = _pins.get(key)
    if mode is not None or pin is None:
        m = machine.Pin.OUT if (mode or "in") == "out" else machine.Pin.IN
        p = None
        if pull == "up":
            p = machine.Pin.PULL_UP
        elif pull == "down":
            p = machine.Pin.PULL_DOWN
        pin = machine.Pin(pin_no, m, p) if p is not None else machine.Pin(pin_no, m)
        _pins[key] = pin
    if value is not None:
        pin.value(1 if value else 0)
    return pin.value()


async def serve_static(app_id, m, req, res, rel):
    """Serve a file of an installed app. rel is the path below the app root."""
    base = app_dir(app_id) + "/www"
    bp = m.get("base_prefix") or ""
    if bp:
        p = "/" + rel.lstrip("/")
        if p.lower().startswith(bp.lower()):
            rel = p[len(bp):]
        elif p.lower() + "/" == bp.lower():
            rel = ""
    rel = rel.strip("/")
    if rel == "":
        rel = m.get("entry") or "index.html"
        if "/" in rel:
            # Start page lives in a subfolder (e.g. demo/index.html): redirect so
            # its relative links resolve against that folder.
            await res.redirect(rel)
            return
    clean = safe_rel(rel)
    if clean is None or clean.endswith(".py"):
        await res.error(404, "Not found")
        return
    fp = base + "/" + clean
    if compat.is_dir(fp):
        fp = fp + "/index.html"
    accepts_gzip = "gzip" in req.headers.get("accept-encoding", "")
    if accepts_gzip and compat.exists(fp + ".gz"):
        await res.file(fp + ".gz", mime_for(fp), gzip=True)
        return
    if not compat.exists(fp):
        if m.get("spa") and "." not in clean.split("/")[-1]:
            fp = base + "/" + (m.get("entry") or "index.html")
        else:
            await res.error(404, "Not found: " + clean)
            return
    await res.file(fp)


class AppHost:
    def __init__(self, app_id):
        self.app_id = app_id
        self.server = Server("app:" + app_id)
        self.backend = None
        self.sdk = SDK(app_id)
        s = self.server
        s.add("GET", "/_picoos/info", self.h_info)
        s.add("GET", "/_picoos/system", self.h_system)
        s.add("GET", "/_picoos/time", self.h_time)
        s.add("GET", "/_picoos/data", self.h_data_list)
        s.add("*", "/_picoos/data/:key", self.h_data)
        s.add("*", "/_picoos/led", self.h_led)
        s.add("*", "/_picoos/gpio/:pin", self.h_gpio)
        s.add("*", "/api/*", self.h_backend)
        s.fallback = self.h_static

    def meta(self):
        m = meta(self.app_id) or {}
        m["id"] = self.app_id
        return m

    def load_backend(self):
        m = self.meta()
        name = m.get("backend")
        self.backend = None
        if not name:
            return
        fp = app_dir(self.app_id) + "/www/" + name
        try:
            with open(compat.path(fp)) as f:
                code = f.read()
            ns = {"__name__": "app_" + self.app_id.replace("-", "_")}
            exec(compile(code, fp, "exec"), ns)
            if "setup" in ns:
                ns["setup"](self.sdk)
            self.backend = ns
            log("Loaded backend for", self.app_id)
        except Exception as e:
            log("Backend error in %s: %r" % (self.app_id, e))

    async def start(self, port):
        self.load_backend()
        await self.server.start(port)
        log("App %s listening on :%d" % (self.app_id, port))

    async def h_static(self, req, res):
        if req.method not in ("GET", "HEAD"):
            await res.error(405, "Method not allowed")
            return
        await serve_static(self.app_id, self.meta(), req, res, req.path)

    async def h_info(self, req, res):
        m = self.meta()
        m["device_name"] = config.get("device_name")
        m["hostname"] = config.get("hostname")
        from . import VERSION
        m["picoos"] = VERSION
        await res.json(m, headers={"Access-Control-Allow-Origin": "*"})

    async def h_system(self, req, res):
        d = sysinfo.snapshot()
        d["time"] = timesvc.snapshot()
        await res.json(d, headers={"Access-Control-Allow-Origin": "*"})

    async def h_time(self, req, res):
        await res.json(timesvc.snapshot(), headers={"Access-Control-Allow-Origin": "*"})

    async def h_data_list(self, req, res):
        keys = [k for k in compat.listdir(app_dir(self.app_id) + "/data") if not k.startswith(".")]
        await res.json({"keys": keys})

    async def h_data(self, req, res):
        key = _safe_key(req.params.get("key"))
        if not key:
            await res.error(400, "Invalid key")
            return
        d = app_dir(self.app_id) + "/data"
        fp = d + "/" + key
        if req.method == "GET":
            if not compat.exists(fp):
                await res.error(404, "No such key")
                return
            await res.file(fp, "application/json")
        elif req.method in ("PUT", "POST"):
            if req.content_length > DATA_LIMIT:
                await res.error(413, "Value larger than %d bytes" % DATA_LIMIT)
                return
            total, free = compat.statvfs()
            if free < RESERVE:
                await res.error(507, "Storage full")
                return
            compat.makedirs(d)
            await req.save_body(fp, DATA_LIMIT)
            await res.json({"ok": True})
        elif req.method == "DELETE":
            compat.rmtree(fp)
            await res.json({"ok": True})
        else:
            await res.error(405, "Method not allowed")

    async def h_led(self, req, res):
        on = None
        if req.method in ("POST", "PUT"):
            body = await req.json()
            on = body.get("on", "toggle")
        await res.json({"on": _led(on)})

    async def h_gpio(self, req, res):
        try:
            pin = int(req.params.get("pin"))
            if req.method in ("POST", "PUT"):
                body = await req.json()
                v = _gpio(pin, body.get("mode"), body.get("value"), body.get("pull"))
            else:
                v = _gpio(pin)
            await res.json({"pin": pin, "value": v})
        except Exception as e:
            await res.error(400, str(e))

    async def h_backend(self, req, res):
        ns = self.backend
        if not ns or "handle" not in ns:
            await serve_static(self.app_id, self.meta(), req, res, req.path)
            return
        body = await req.body() if req.method in ("POST", "PUT", "PATCH", "DELETE") else b""
        sub = "/" + req.params.get("*", "")
        try:
            out = ns["handle"](req.method, sub, req.query, body)
            if hasattr(out, "send"):  # coroutine/generator from an async handler
                out = await out
        except Exception as e:
            log("Backend %s error: %r" % (self.app_id, e))
            await res.error(500, "Backend error: %r" % e)
            return
        if isinstance(out, tuple):
            status, ctype, data = out
            await res.send(status, data, ctype)
        elif isinstance(out, (dict, list)):
            await res.json(out)
        elif out is None:
            await res.send(204, b"", None)
        else:
            await res.send(200, str(out))


async def start_app(app_id):
    m = meta(app_id)
    if not m or not m.get("port"):
        return
    if app_id in hosts:
        return
    h = AppHost(app_id)
    try:
        await h.start(m["port"])
        hosts[app_id] = h
    except Exception as e:
        log("Could not start %s on :%s: %r" % (app_id, m["port"], e))


async def stop_app(app_id):
    h = hosts.pop(app_id, None)
    if h:
        await h.server.stop()
        log("Stopped app", app_id)


async def start_all():
    compat.rmtree(STAGING_DIR)
    compat.makedirs(APPS_DIR)
    for app_id in installed_ids():
        m = meta(app_id) or {}
        if m.get("enabled", True):
            await start_app(app_id)
