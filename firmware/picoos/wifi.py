# PicoOS - Wi-Fi helpers (station + setup access point) for the CYW43439.
import network

from . import compat
from .log import log

AP_IP = "192.168.4.1"

_REASONS = {
    -3: "Wrong password",
    -2: "Network not found",
    -1: "Connection failed",
    0: "Idle",
    1: "Connecting",
    2: "Waiting for IP address",
    3: "Connected",
}


def sta():
    return network.WLAN(network.STA_IF)


def ap():
    return network.WLAN(network.AP_IF)


def _ip(wlan):
    try:
        return wlan.ifconfig()[0]
    except Exception:
        try:
            return wlan.ipconfig("addr4")[0]
        except Exception:
            return "0.0.0.0"


def mac_suffix():
    try:
        mac = sta().config("mac")
        return "%02X%02X" % (mac[-2], mac[-1])
    except Exception:
        return "0000"


def reason(status):
    return _REASONS.get(status, "Status %s" % status)


def set_hostname(name):
    try:
        network.hostname(name)
    except Exception as e:
        log("hostname error", e)


async def connect(ssid, password, hostname="pico", timeout_ms=20000):
    """Connect the station interface. Returns (ok, message)."""
    set_hostname(hostname)
    w = sta()
    w.active(True)
    try:
        w.config(pm=network.WLAN.PM_NONE)  # lower latency for a web server
    except Exception:
        pass
    try:
        w.disconnect()
    except Exception:
        pass
    log("Connecting to", ssid)
    if password:
        w.connect(ssid, password)
    else:
        w.connect(ssid)
    start = compat.ticks_ms()
    status = 1
    while compat.ticks_diff(compat.ticks_ms(), start) < timeout_ms:
        status = w.status()
        if status == network.STAT_GOT_IP:
            ip = _ip(w)
            log("Connected, IP", ip)
            return True, ip
        if status in (network.STAT_WRONG_PASSWORD, network.STAT_NO_AP_FOUND):
            break
        await compat.sleep_ms(250)
    msg = reason(status) if status != 1 else "Timed out"
    log("Wi-Fi connect failed:", msg)
    try:
        w.disconnect()
    except Exception:
        pass
    return False, msg


def is_connected():
    try:
        w = sta()
        return w.isconnected() and w.status() == network.STAT_GOT_IP
    except Exception:
        return False


def info():
    w = sta()
    d = {"connected": False, "ssid": "", "ip": "", "rssi": None, "mac": ""}
    try:
        mac = w.config("mac")
        d["mac"] = ":".join("%02X" % b for b in mac)
    except Exception:
        pass
    if is_connected():
        d["connected"] = True
        d["ip"] = _ip(w)
        try:
            d["ssid"] = w.config("ssid")
        except Exception:
            pass
        try:
            d["rssi"] = w.status("rssi")
        except Exception:
            pass
    return d


def start_ap(ssid, password=""):
    a = ap()
    a.active(True)
    try:
        if password and len(password) >= 8:
            a.config(ssid=ssid, key=password, security=network.WLAN.SEC_WPA_WPA2)
        else:
            a.config(ssid=ssid, security=network.WLAN.SEC_OPEN)
    except Exception:
        a.config(essid=ssid)
    try:
        a.ifconfig((AP_IP, "255.255.255.0", AP_IP, AP_IP))
    except Exception:
        pass
    log("Setup AP started:", ssid, "at", AP_IP)
    return AP_IP


def stop_ap():
    try:
        ap().active(False)
    except Exception:
        pass


def scan():
    """Scan for networks. Returns a list of dicts, strongest first, de-duplicated."""
    w = sta()
    w.active(True)
    found = {}
    try:
        results = w.scan()
    except Exception as e:
        log("scan error", e)
        results = []
    for r in results:
        try:
            ssid = r[0].decode() if isinstance(r[0], (bytes, bytearray)) else str(r[0])
        except Exception:
            continue
        if not ssid or ssid.startswith("\x00"):
            continue
        rssi = r[3]
        if ssid not in found or found[ssid]["rssi"] < rssi:
            found[ssid] = {"ssid": ssid, "rssi": rssi, "channel": r[2], "secure": r[4] != 0}
    nets = list(found.values())
    nets.sort(key=lambda n: -n["rssi"])
    return nets
