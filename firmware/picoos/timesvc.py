# PicoOS - internet time: NTP for the clock + IP geolocation for the time zone.
import asyncio
import json
import time

from . import compat, config
from .log import log

# Seconds between the device epoch and the Unix epoch (0 on modern MicroPython).
try:
    EPOCH_DELTA = 0 if time.gmtime(0)[0] == 1970 else 946684800
except Exception:
    EPOCH_DELTA = 0

state = {
    "synced": False,     # True once the clock was set from the internet
    "source": "",        # "ntp" / "worldtimeapi"
    "last_sync": 0,      # unix time of the last successful sync
    "offset": 0,         # utc offset in seconds (incl. DST) from geolocation
    "tz": "UTC",
    "city": "",
    "region": "",
    "country": "",
    "located": False,
}

NTP_HOSTS = ("pool.ntp.org", "time.google.com", "time.cloudflare.com")


def unix_now():
    return time.time() + EPOCH_DELTA


def current_offset():
    """UTC offset in seconds that the dashboard should use."""
    if config.get("tz_mode") == "manual":
        return int(config.get("tz_offset") or 0) * 60
    return state["offset"]


def current_tz_name():
    if config.get("tz_mode") == "manual":
        return config.get("tz_name") or "Manual"
    return state["tz"]


def snapshot():
    return {
        "unix": unix_now(),
        "offset": current_offset(),
        "tz": current_tz_name(),
        "mode": config.get("tz_mode"),
        "city": state["city"],
        "region": state["region"],
        "country": state["country"],
        "synced": state["synced"],
        "source": state["source"],
        "located": state["located"],
    }


async def http_get_json(host, path, timeout=8):
    """Very small async HTTP/1.0 GET returning parsed JSON (plain HTTP only)."""
    reader, writer = await asyncio.wait_for(asyncio.open_connection(host, 80), timeout)
    try:
        req = "GET %s HTTP/1.0\r\nHost: %s\r\nUser-Agent: PicoOS\r\nAccept: application/json\r\nConnection: close\r\n\r\n" % (path, host)
        writer.write(req.encode())
        await writer.drain()
        data = b""
        while True:
            chunk = await asyncio.wait_for(reader.read(1024), timeout)
            if not chunk:
                break
            data += chunk
            if len(data) > 16384:
                break
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass
    i = data.find(b"\r\n\r\n")
    if i < 0:
        raise ValueError("bad response")
    status = data[:data.find(b"\r\n")]
    if b" 200" not in status:
        raise ValueError(status.decode())
    return json.loads(data[i + 4:])


def _set_rtc(unix):
    try:
        import machine
        t = time.gmtime(int(unix) - EPOCH_DELTA)
        machine.RTC().datetime((t[0], t[1], t[2], t[6] + 1, t[3], t[4], t[5], 0))
        return True
    except Exception as e:
        log("RTC set failed", e)
        return False


def sync_ntp():
    try:
        import ntptime
    except ImportError:
        return False
    for host in NTP_HOSTS:
        try:
            ntptime.host = host
            ntptime.timeout = 2
            ntptime.settime()
            state["synced"] = True
            state["source"] = "ntp"
            state["last_sync"] = unix_now()
            log("Clock synced via NTP (%s)" % host)
            return True
        except Exception as e:
            log("NTP", host, "failed:", e)
    return False


async def geolocate():
    """Find the time zone of the current public IP."""
    try:
        d = await http_get_json("ip-api.com", "/json/?fields=status,country,regionName,city,timezone,offset")
        if d.get("status") == "success":
            state.update({
                "offset": int(d.get("offset", 0)),
                "tz": d.get("timezone", "UTC"),
                "city": d.get("city", ""),
                "region": d.get("regionName", ""),
                "country": d.get("country", ""),
                "located": True,
            })
            log("Location: %s, %s (%s, UTC%+.1f)" % (state["city"], state["country"], state["tz"], state["offset"] / 3600))
            return True
    except Exception as e:
        log("ip-api.com failed:", e)
    try:
        d = await http_get_json("worldtimeapi.org", "/api/ip")
        off = int(d.get("raw_offset", 0)) + int(d.get("dst_offset", 0))
        state.update({"offset": off, "tz": d.get("timezone", "UTC"), "located": True})
        if not state["synced"] and d.get("unixtime"):
            if _set_rtc(d["unixtime"]):
                state["synced"] = True
                state["source"] = "worldtimeapi"
                state["last_sync"] = unix_now()
        return True
    except Exception as e:
        log("worldtimeapi.org failed:", e)
    return False


async def run():
    """Background task: sync at boot, then refresh every 6 hours (DST changes)."""
    while True:
        ok = sync_ntp()
        await geolocate()
        await compat.sleep_ms((6 * 3600 if ok and state["located"] else 120) * 1000)
