# PicoOS - small compatibility layer so the same code runs on MicroPython
# (the real device) and on CPython (the desktop simulator in tools/).
import sys
import time

MICROPYTHON = sys.implementation.name == "micropython"

# Root of the filesystem. "" on the device; the simulator points it at a
# folder on disk so nothing outside it is touched.
ROOT = ""

# Port of the dashboard / setup web server (the simulator changes it).
HTTP_PORT = 80

if MICROPYTHON:
    ticks_ms = time.ticks_ms
    ticks_diff = time.ticks_diff
else:
    _t0 = time.monotonic()

    def ticks_ms():
        return int((time.monotonic() - _t0) * 1000)

    def ticks_diff(a, b):
        return a - b


def path(p):
    """Map an absolute PicoOS path to the real filesystem path."""
    return ROOT + p


def exists(p):
    import os
    try:
        os.stat(path(p))
        return True
    except OSError:
        return False


def is_dir(p):
    import os
    try:
        return os.stat(path(p))[0] & 0x4000 != 0
    except OSError:
        return False


def listdir(p):
    import os
    try:
        return sorted(os.listdir(path(p)))
    except OSError:
        return []


def makedirs(p):
    import os
    cur = ""
    for part in p.strip("/").split("/"):
        if not part:
            continue
        cur += "/" + part
        if not exists(cur):
            os.mkdir(path(cur))


def rmtree(p):
    import os
    if not exists(p):
        return
    if is_dir(p):
        for name in listdir(p):
            rmtree(p + "/" + name)
        os.rmdir(path(p))
    else:
        os.remove(path(p))


def tree_size(p):
    """Total size in bytes of all files below p."""
    import os
    if not exists(p):
        return 0
    if not is_dir(p):
        return os.stat(path(p))[6]
    total = 0
    for name in listdir(p):
        total += tree_size(p + "/" + name)
    return total


def file_size(p):
    import os
    return os.stat(path(p))[6]


def read_json(p, default=None):
    import json
    try:
        with open(path(p)) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json(p, data):
    import json
    import os
    tmp = p + ".tmp"
    with open(path(tmp), "w") as f:
        json.dump(data, f)
    try:
        os.remove(path(p))
    except OSError:
        pass
    os.rename(path(tmp), path(p))


def statvfs():
    """Return (total_bytes, free_bytes) of the user filesystem."""
    import os
    try:
        st = os.statvfs(path("/") if ROOT else "/")
        bsize = st[1] or st[0]
        return st[2] * bsize, st[4] * bsize
    except (OSError, AttributeError):
        return 0, 0


async def sleep_ms(ms):
    import asyncio
    if MICROPYTHON:
        await asyncio.sleep_ms(ms)
    else:
        await asyncio.sleep(ms / 1000)
