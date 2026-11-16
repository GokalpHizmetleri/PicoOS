#!/usr/bin/env python3
"""End-to-end smoke test for PicoOS.

Starts PicoOS (on CPython via the simulator, or on the MicroPython unix port
with fake hardware) and exercises the real HTTP API: status, installing an app
from the store folder, serving it on its own port, the app SDK, the Python
backend, settings and uninstalling.

    python3 tests/smoke_test.py                         # CPython simulator
    python3 tests/smoke_test.py --micropython /path/to/micropython
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 18080
FAILS = []


def req(method, url, body=None, ctype=None, raw=False):
    data = body
    headers = {}
    if isinstance(body, (dict, list)):
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    if ctype:
        headers["Content-Type"] = ctype
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            content = resp.read()
            return resp.status, (content if raw else json.loads(content or b"null")), resp.headers
    except urllib.error.HTTPError as e:
        content = e.read()
        try:
            return e.code, json.loads(content), e.headers
        except ValueError:
            return e.code, content, e.headers


def check(name, cond, detail=""):
    print(("  PASS " if cond else "  FAIL ") + name + ("" if cond else "  -> %s" % (detail,)))
    if not cond:
        FAILS.append(name)


def wait_up(url, proc, secs=20):
    t = time.time()
    while time.time() - t < secs:
        if proc.poll() is not None:
            return False
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except urllib.error.HTTPError:
            return True
        except Exception:
            time.sleep(0.3)
    return False


def install_store_app(base, app_id):
    with open(os.path.join(ROOT, "store", "catalog.json")) as f:
        cat = json.load(f)
    app = next(a for a in cat["apps"] if a["id"] == app_id)
    meta = {k: app.get(k) for k in ("id", "name", "version", "description", "icon", "entry", "backend", "category")}
    meta.update(size=app["size"], files=len(app["files"]), source="store")
    s, r, _ = req("POST", base + "/api/apps/install/begin", meta)
    check("install/begin %s" % app_id, s == 200, r)
    for f in app["files"]:
        with open(os.path.join(ROOT, app["path"], f["path"]), "rb") as fh:
            s, r, _ = req("PUT", base + "/api/apps/install/file?id=%s&path=%s" % (app_id, f["path"]), fh.read(), "application/octet-stream")
        check("upload %s/%s" % (app_id, f["path"]), s == 200, r)
    s, r, _ = req("POST", base + "/api/apps/install/commit", {"id": app_id})
    check("install/commit %s" % app_id, s == 200 and r["app"]["port"], r)
    return r.get("app", {})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--micropython", help="path to a MicroPython unix binary")
    args = ap.parse_args()

    fs = tempfile.mkdtemp(prefix="picoos-test-")
    if args.micropython:
        cmd = [args.micropython, os.path.join(ROOT, "tests", "run_micropython.py"), fs, str(PORT)]
        label = "MicroPython unix port"
    else:
        cmd = [sys.executable, os.path.join(ROOT, "tools", "simulator.py"), "--fs", fs, "--port", str(PORT)]
        label = "CPython simulator"
    print("Starting PicoOS on the %s" % label)
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, cwd=ROOT)
    base = "http://127.0.0.1:%d" % PORT
    try:
        if not wait_up(base + "/api/status", proc):
            print(proc.stdout.read().decode(errors="replace") if proc.poll() is not None else "timeout")
            check("server starts", False)
            return 1

        s, st, _ = req("GET", base + "/api/status")
        check("GET /api/status", s == 200 and st["wifi"]["connected"], st)
        check("storage info", st["system"]["storage"]["total"] > 0, st["system"]["storage"])
        check("time info", st["time"]["tz"] == "Europe/Istanbul" and st["time"]["offset"] == 10800, st["time"])

        s, body, h = req("GET", base + "/", raw=True)
        check("dashboard served gzipped", s == 200 and h.get("Content-Encoding") == "gzip" and body[:2] == b"\x1f\x8b", (s, dict(h)))
        s, body, h = req("GET", base + "/app.js", raw=True)
        check("app.js served", s == 200 and "javascript" in h.get("Content-Type", ""))

        # install two apps from the store folder
        calc = install_store_app(base, "calculator")
        gb = install_store_app(base, "guestbook")

        s, r, _ = req("GET", base + "/api/apps")
        ids = [a["id"] for a in r["apps"]]
        check("apps listed", ids == ["calculator", "guestbook"], ids)
        check("apps running", all(a["running"] for a in r["apps"]), r["apps"])
        check("ports differ", calc["port"] != gb["port"], (calc.get("port"), gb.get("port")))

        app_base = "http://127.0.0.1:%d" % calc["port"]
        time.sleep(0.3)
        s, body, h = req("GET", app_base + "/", raw=True)
        check("app served on its own port", s == 200 and b"Calculator" in body, s)
        s, body, h = req("GET", app_base + "/icon.svg", raw=True)
        check("app icon mime", s == 200 and h.get("Content-Type") == "image/svg+xml", h.get("Content-Type"))
        s, body, _ = req("GET", base + "/apps/calculator/", raw=True)
        check("app served under dashboard /apps/<id>/", s == 200 and b"Calculator" in body, s)
        s, _, _ = req("GET", app_base + "/../../.picoos/config.json", raw=True)
        check("path traversal blocked", s == 404, s)
        s, body, _ = req("GET", base + "/api/apps/calculator/icon", raw=True)
        check("icon via dashboard", s == 200 and b"<svg" in body, s)

        # SDK
        s, r, _ = req("PUT", app_base + "/_picoos/data/hello", {"n": 42})
        check("SDK data PUT", s == 200, r)
        s, r, _ = req("GET", app_base + "/_picoos/data/hello")
        check("SDK data GET", r == {"n": 42}, r)
        s, r, _ = req("GET", base + "/apps/calculator/_picoos/data/hello")
        check("SDK forwarded through /apps/<id>/", r == {"n": 42}, r)
        s, r, _ = req("GET", app_base + "/_picoos/system")
        check("SDK system", s == 200 and "memory" in r and "time" in r, r)
        s, r, _ = req("POST", app_base + "/_picoos/led", {"on": True})
        check("SDK led", s == 200 and r["on"] is True, r)
        s, r, _ = req("POST", app_base + "/_picoos/gpio/25", {"mode": "out", "value": 1})
        check("SDK refuses wireless GPIO 25", s == 400, r)

        # Python backend
        gbase = "http://127.0.0.1:%d" % gb["port"]
        s, r, _ = req("POST", gbase + "/api/entries", {"name": "Tester", "text": "Hello from the smoke test"})
        check("backend POST", s == 200 and r.get("ok"), r)
        s, r, _ = req("GET", gbase + "/api/entries")
        check("backend GET", s == 200 and r["entries"][0]["text"] == "Hello from the smoke test", r)
        s, r, _ = req("GET", gbase + "/backend.py", raw=True)
        check("backend source not served", s == 404, s)

        # update keeps data + port
        calc2 = install_store_app(base, "calculator")
        check("update keeps port", calc2.get("port") == calc["port"], calc2)
        s, r, _ = req("GET", app_base + "/_picoos/data/hello")
        check("update keeps data", r == {"n": 42}, r)

        # stop / start
        s, r, _ = req("POST", base + "/api/apps/calculator/enable", {"enabled": False})
        check("stop app", s == 200 and r["app"]["running"] is False, r)
        s, r, _ = req("POST", base + "/api/apps/calculator/enable", {"enabled": True})
        check("start app", s == 200 and r["app"]["running"] is True, r)

        # validation
        s, r, _ = req("POST", base + "/api/apps/install/begin", {"id": "../evil", "size": 10})
        check("invalid id rejected", s == 400, r)
        s, r, _ = req("POST", base + "/api/apps/install/begin", {"id": "huge", "size": 50 * 1024 * 1024})
        check("too large rejected (507)", s == 507, r)

        # settings
        s, r, _ = req("POST", base + "/api/settings", {"device_name": "Test Pico", "tz_mode": "manual", "tz_offset": 60})
        check("settings saved", s == 200 and r["settings"]["device_name"] == "Test Pico", r)
        s, r, _ = req("GET", base + "/api/time")
        check("manual time zone", r["offset"] == 3600, r)
        check("password not exposed", "password" not in r and "password" not in req("GET", base + "/api/settings")[1])

        s, r, _ = req("DELETE", base + "/api/apps/guestbook")
        check("uninstall", s == 200, r)
        s, r, _ = req("GET", base + "/api/apps")
        check("uninstalled app gone", [a["id"] for a in r["apps"]] == ["calculator"], r)
        s, r, _ = req("GET", base + "/api/logs")
        check("logs", s == 200 and len(r["lines"]) > 3, r)
    finally:
        proc.terminate()
        try:
            proc.wait(5)
        except subprocess.TimeoutExpired:
            proc.kill()
        shutil.rmtree(fs, ignore_errors=True)

    print("\n%s: %s" % (label, "ALL PASSED" if not FAILS else "%d FAILED: %s" % (len(FAILS), ", ".join(FAILS))))
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
