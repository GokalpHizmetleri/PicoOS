# Fake `network` module for running PicoOS under the MicroPython unix port.
import time

STA_IF = 0
AP_IF = 1
STAT_IDLE = 0
STAT_CONNECTING = 1
STAT_WRONG_PASSWORD = -3
STAT_NO_AP_FOUND = -2
STAT_CONNECT_FAIL = -1
STAT_GOT_IP = 3

_state = {0: {"active": False, "status": 0, "ssid": "", "t": 0, "target": 3},
          1: {"active": False, "status": 0, "ssid": "", "t": 0, "target": 3}}


def hostname(name=None):
    return "pico"


class WLAN:
    PM_NONE = 0
    SEC_OPEN = 0
    SEC_WPA_WPA2 = 4

    def __init__(self, iface):
        self.i = iface
        self.s = _state[iface]

    def active(self, v=None):
        if v is None:
            return self.s["active"]
        self.s["active"] = v

    def config(self, *a, **kw):
        if a:
            return {"mac": b"\x28\xcd\xc1\x0a\xb3\x7e", "ssid": self.s["ssid"]}.get(a[0])
        if "ssid" in kw:
            self.s["ssid"] = kw["ssid"]

    def connect(self, ssid, password=None):
        self.s["ssid"] = ssid
        self.s["t"] = time.ticks_ms()
        self.s["status"] = 1
        self.s["target"] = -3 if password == "wrong" else 3

    def disconnect(self):
        self.s["status"] = 0

    def status(self, what=None):
        if what == "rssi":
            return -55
        if what == "stations":
            return []
        if self.s["status"] == 1 and time.ticks_diff(time.ticks_ms(), self.s["t"]) > 500:
            self.s["status"] = self.s["target"]
        return self.s["status"]

    def isconnected(self):
        return self.status() == 3

    def ifconfig(self, cfg=None):
        return ("127.0.0.1", "255.0.0.0", "127.0.0.1", "127.0.0.1")

    def scan(self):
        return [(b"HomeNetwork", b"", 6, -48, 3, 0), (b"Cafe Guest", b"", 1, -72, 0, 0)]
