#!/usr/bin/env python3
"""PicoOS desktop simulator.

Runs the real PicoOS code (firmware/picoos) on CPython with fake hardware
modules, so you can develop the dashboard, the setup portal and apps without
flashing a Pico.

    python3 tools/simulator.py              # dashboard on http://localhost:8080
    python3 tools/simulator.py --setup      # Wi-Fi setup portal instead
    python3 tools/simulator.py --reset      # start with an empty filesystem

Apps are served on ports 8081+ exactly like on the device. The simulated
flash lives in ./.simfs (2.5 MB quota is reported to the dashboard).
"""
import argparse
import asyncio
import os
import random
import shutil
import sys
import time
import types

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "firmware"))

FLASH_BYTES = 2621440


# ------------------------------------------------------------ fake hardware
def install_fakes(args):
    network = types.ModuleType("network")
    network.STA_IF, network.AP_IF = 0, 1
    network.STAT_IDLE, network.STAT_CONNECTING = 0, 1
    network.STAT_WRONG_PASSWORD, network.STAT_NO_AP_FOUND = -3, -2
    network.STAT_CONNECT_FAIL, network.STAT_GOT_IP = -1, 3
    nets = [
        (b"HomeNetwork", b"\x00" * 6, 6, -48, 3, 0),
        (b"Office-5G", b"\x00" * 6, 36, -61, 3, 0),
        (b"Cafe Guest", b"\x00" * 6, 1, -72, 0, 0),
        (b"Neighbor_2.4", b"\x00" * 6, 11, -84, 3, 0),
    ]

    class WLAN:
        PM_NONE = 0
        SEC_OPEN = 0
        SEC_WPA_WPA2 = 4
        _state = {0: {"active": False, "status": 0, "ssid": ""}, 1: {"active": False, "status": 0, "ssid": ""}}

        def __init__(self, iface):
            self.i = iface
            self.s = WLAN._state[iface]

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
            self.s["t"] = time.monotonic()
            self.s["status"] = 1
            self.s["target"] = -3 if password == "wrong" else 3

        def disconnect(self):
            self.s["status"] = 0

        def status(self, what=None):
            if what == "rssi":
                return -52
            if what == "stations":
                return []
            if self.s["status"] == 1 and time.monotonic() - self.s["t"] > 1.5:
                self.s["status"] = self.s["target"]
            return self.s["status"]

        def isconnected(self):
            return self.status() == 3

        def ifconfig(self, cfg=None):
            return ("192.168.1.42", "255.255.255.0", "192.168.1.1", "192.168.1.1") if self.i == 0 else ("192.168.4.1",) * 4

        def scan(self):
            return [(n[0], n[1], n[2], n[3] + random.randint(-3, 3), n[4], n[5]) for n in nets]

    network.WLAN = WLAN
    network.hostname = lambda name=None: "pico"
    sys.modules["network"] = network

    machine = types.ModuleType("machine")

    class Pin:
        OUT, IN, PULL_UP, PULL_DOWN = 1, 0, 1, 2
        _v = {}

        def __init__(self, pin, mode=None, pull=None):
            self.pin = pin

        def value(self, v=None):
            if v is None:
                return Pin._v.get(self.pin, 0)
            Pin._v[self.pin] = v

    class ADC:
        def __init__(self, ch):
            pass

        def read_u16(self):
            return int((0.706 - (random.uniform(30.5, 32.0) - 27) * 0.001721) / 3.3 * 65535)

    class RTC:
        def datetime(self, *a):
            return None

    machine.Pin, machine.ADC, machine.RTC = Pin, ADC, RTC
    machine.freq = lambda: 150000000

    def reset():
        print("[simulator] machine.reset() called - restarting the simulator")
        os.execv(sys.executable, [sys.executable] + sys.argv)

    machine.reset = reset
    sys.modules["machine"] = machine

    ntptime = types.ModuleType("ntptime")
    ntptime.host, ntptime.timeout = "pool.ntp.org", 1
    ntptime.settime = lambda: None
    sys.modules["ntptime"] = ntptime


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--setup", action="store_true", help="start in Wi-Fi setup mode")
    ap.add_argument("--reset", action="store_true", help="wipe the simulated filesystem first")
    ap.add_argument("--port", type=int, default=8080, help="dashboard port (default 8080)")
    ap.add_argument("--fs", default=os.path.join(ROOT, ".simfs"), help="simulated flash folder")
    args = ap.parse_args()

    if args.reset and os.path.isdir(args.fs):
        shutil.rmtree(args.fs)
    os.makedirs(args.fs, exist_ok=True)

    install_fakes(args)
    # Build the gzipped UI bundle from firmware/web so edits show up on restart.
    import subprocess
    subprocess.run([sys.executable, os.path.join(ROOT, "tools", "build_assets.py")], check=True, stdout=subprocess.DEVNULL)

    from picoos import compat, config, timesvc
    compat.ROOT = args.fs
    compat.HTTP_PORT = args.port

    def statvfs():
        used = compat.tree_size("/")
        return FLASH_BYTES, max(0, FLASH_BYTES - used - 180 * 1024)

    compat.statvfs = statvfs

    cfg = config.load()
    if args.setup:
        config.set(ssid="", password="")
    elif not cfg.get("ssid"):
        config.set(ssid="HomeNetwork", password="simulated")

    async def fake_geolocate():
        timesvc.state.update({"offset": 3 * 3600, "tz": "Europe/Istanbul", "city": "Istanbul",
                              "region": "Istanbul", "country": "Türkiye", "located": True})
        return True

    def fake_ntp():
        timesvc.state.update({"synced": True, "source": "ntp", "last_sync": time.time()})
        return True

    timesvc.geolocate = fake_geolocate

    # Report device-like values instead of the host's.
    from picoos import sysinfo
    _snap = sysinfo.snapshot
    sysinfo.board = lambda: "Raspberry Pi Pico 2 W with RP2350 (simulator)"

    def snapshot():
        d = _snap()
        d["micropython"] = "1.29.0"
        d["board"] = sysinfo.board()
        return d

    sysinfo.snapshot = snapshot
    timesvc.sync_ntp = fake_ntp

    print("PicoOS simulator - %s on http://localhost:%d  (Ctrl+C to quit)" % ("setup portal" if args.setup else "dashboard", args.port))
    from picoos import main as picomain
    try:
        asyncio.run(picomain.boot())
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
