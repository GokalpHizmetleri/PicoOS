# PicoOS - persistent configuration stored in /.picoos/config.json
# (a dot-folder on purpose: a plain "/picoos" folder would shadow the frozen
# picoos package, because MicroPython searches the filesystem root first)
from . import compat

CONFIG_DIR = "/.picoos"
CONFIG_FILE = CONFIG_DIR + "/config.json"

DEFAULTS = {
    # Wi-Fi client credentials. Empty ssid = run the setup access point.
    "ssid": "",
    "password": "",
    # mDNS / DHCP hostname -> http://<hostname>.local
    "hostname": "pico",
    # Device display name shown in the dashboard.
    "device_name": "PicoOS",
    # Time zone: "auto" (IP geolocation) or "manual" (tz_offset minutes).
    "tz_mode": "auto",
    "tz_offset": 0,
    "tz_name": "UTC",
    # Name of the setup access point ("" = PicoOS-Setup-XXXX).
    "ap_ssid": "",
    # Optional WPA2 password for the setup AP ("" = open network).
    "ap_password": "",
    # Where the App Store's featured catalog is loaded from (GitHub owner/repo@branch).
    # Empty = automatic: the branch this firmware was built from, then main.
    "store_repo": "",
    "store_branch": "",
    # Dashboard look.
    "wallpaper": "aurora",
}

_cfg = None


def load():
    global _cfg
    data = compat.read_json(CONFIG_FILE, {}) or {}
    cfg = dict(DEFAULTS)
    cfg.update(data)
    _cfg = cfg
    return cfg


def get(key=None):
    if _cfg is None:
        load()
    if key is None:
        return _cfg
    return _cfg.get(key, DEFAULTS.get(key))


def set(**kwargs):
    if _cfg is None:
        load()
    _cfg.update(kwargs)
    save()


def save():
    compat.makedirs(CONFIG_DIR)
    compat.write_json(CONFIG_FILE, _cfg)


def public():
    """Config without secrets, safe to send to the browser."""
    c = dict(get())
    c.pop("password", None)
    c.pop("ap_password", None)
    return c
