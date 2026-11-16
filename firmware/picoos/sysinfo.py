# PicoOS - system information (storage, memory, temperature, uptime).
import gc
import sys

from . import VERSION, compat

_boot_ticks = compat.ticks_ms()
_uptime_s = [0]
_last_ticks = [_boot_ticks]


def uptime():
    # Accumulate so it keeps counting past the ticks_ms wrap-around.
    now = compat.ticks_ms()
    d = compat.ticks_diff(now, _last_ticks[0])
    if d >= 1000:
        _uptime_s[0] += d // 1000
        _last_ticks[0] = now - (d % 1000)
    return _uptime_s[0]


def temperature():
    try:
        import machine
        adc = machine.ADC(4)
        v = adc.read_u16() * 3.3 / 65535
        return round(27 - (v - 0.706) / 0.001721, 1)
    except Exception:
        return None


def cpu_freq():
    try:
        import machine
        return machine.freq()
    except Exception:
        return 150000000


def storage():
    total, free = compat.statvfs()
    apps = compat.tree_size("/apps")
    return {"total": total, "free": free, "used": total - free, "apps": apps}


def memory():
    gc.collect()
    try:
        free = gc.mem_free()
        alloc = gc.mem_alloc()
    except AttributeError:
        free, alloc = 400 * 1024, 120 * 1024
    return {"total": free + alloc, "free": free, "used": alloc}


def board():
    try:
        import os
        return os.uname().machine
    except Exception:
        return "Raspberry Pi Pico 2 W"


def snapshot():
    return {
        "version": VERSION,
        "board": board(),
        "micropython": ".".join(str(x) for x in sys.implementation.version[:3]),
        "cpu_freq": cpu_freq(),
        "uptime": uptime(),
        "temperature": temperature(),
        "storage": storage(),
        "memory": memory(),
    }
