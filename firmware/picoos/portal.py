# PicoOS - first-run / fallback Wi-Fi setup portal (runs on the setup access point).
import asyncio

from . import compat, config, wifi
from .http import Server
from .log import log

state = {
    "scan": [],
    "attempt": "idle",   # idle | connecting | ok | failed
    "message": "",
    "ip": "",
    "last_error": "",
}


def _assets():
    from . import assets
    return assets.FILES


async def _reset_later(ms):
    await compat.sleep_ms(ms)
    log("Rebooting...")
    try:
        import machine
        machine.reset()
    except ImportError:
        log("(simulator: reboot skipped)")


def build(ap_ssid, last_error=""):
    state["last_error"] = last_error
    srv = Server("setup")
    files = _assets()

    async def index(req, res):
        ctype, data = files["/setup.html"]
        await res.asset(data, ctype)

    async def favicon(req, res):
        ctype, data = files["/favicon.svg"]
        await res.asset(data, ctype)

    async def h_state(req, res):
        cfg = config.get()
        await res.json({
            "ap_ssid": ap_ssid,
            "device_name": cfg.get("device_name"),
            "hostname": cfg.get("hostname"),
            "saved_ssid": cfg.get("ssid"),
            "last_error": state["last_error"],
            "mac": wifi.mac_suffix(),
        })

    async def h_scan(req, res):
        if req.query.get("refresh") or not state["scan"]:
            state["scan"] = wifi.scan()
        await res.json({"networks": state["scan"]})

    async def attempt(ssid, password, hostname, device_name):
        state["attempt"] = "connecting"
        state["message"] = "Connecting to %s..." % ssid
        ok, msg = await wifi.connect(ssid, password, hostname, 25000)
        if ok:
            state["attempt"] = "ok"
            state["ip"] = msg
            state["message"] = "Connected"
            config.set(ssid=ssid, password=password, hostname=hostname, device_name=device_name)
            log("Wi-Fi credentials saved, rebooting into dashboard mode")
            await _reset_later(9000)
        else:
            state["attempt"] = "failed"
            state["message"] = msg

    async def h_connect(req, res):
        body = await req.json()
        ssid = (body.get("ssid") or "").strip()
        if not ssid:
            await res.error(400, "Choose a network")
            return
        if state["attempt"] == "connecting":
            await res.error(409, "Already connecting")
            return
        hostname = (body.get("hostname") or "pico").strip().lower() or "pico"
        hostname = "".join(c for c in hostname if c.isalpha() or c.isdigit() or c == "-")[:24] or "pico"
        device_name = (body.get("device_name") or "PicoOS").strip()[:32] or "PicoOS"
        asyncio.create_task(attempt(ssid, body.get("password") or "", hostname, device_name))
        await res.json({"ok": True})

    async def h_status(req, res):
        await res.json({
            "state": state["attempt"],
            "message": state["message"],
            "ip": state["ip"],
            "hostname": config.get("hostname"),
        })

    async def captive(req, res):
        # Anything else (captive-portal probes, other hosts) -> the setup page.
        await res.redirect("http://%s/" % wifi.AP_IP)

    srv.add("GET", "/", index)
    srv.add("GET", "/favicon.svg", favicon)
    srv.add("GET", "/api/setup/state", h_state)
    srv.add("GET", "/api/setup/scan", h_scan)
    srv.add("POST", "/api/setup/connect", h_connect)
    srv.add("GET", "/api/setup/status", h_status)
    srv.fallback = captive
    return srv


async def retry_saved(ssid, password, hostname, interval_s=180):
    """While in setup mode, periodically retry the saved network (e.g. router was down)."""
    while True:
        await compat.sleep_ms(interval_s * 1000)
        if state["attempt"] in ("connecting", "ok"):
            continue
        try:
            if wifi.ap().status("stations"):
                continue  # someone is using the setup page right now
        except Exception:
            pass
        log("Retrying saved network", ssid)
        ok, msg = await wifi.connect(ssid, password, hostname, 15000)
        if ok:
            await _reset_later(500)
            return
        state["last_error"] = "Could not connect to %s: %s" % (ssid, msg)
