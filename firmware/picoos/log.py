# PicoOS - in-memory ring buffer log (shown in Settings > Logs) + console echo.
import time

_lines = []
_MAX = 120


def log(*args):
    t = time.localtime()
    stamp = "%02d:%02d:%02d" % (t[3], t[4], t[5])
    msg = " ".join(str(a) for a in args)
    line = stamp + " " + msg
    print("[PicoOS]", line)
    _lines.append(line)
    if len(_lines) > _MAX:
        del _lines[0]


def lines():
    return list(_lines)
