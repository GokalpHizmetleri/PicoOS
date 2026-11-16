# PicoOS - boot sequence.
#
#   1. Load /picoos/config.json
#   2. Pressing BOOTSEL within 2 s of power-up and holding it 3 s clears the saved Wi-Fi
#   3. No saved Wi-Fi           -> setup access point + captive portal
#      Saved Wi-Fi, can't join  -> setup access point (and keep retrying)
#      Connected                -> dashboard on http://<hostname>.local + apps
import asyncio
import gc

from . import NAME, VERSION, apps, compat, config, timesvc, wifi
from .log import log

_led = None


def led(on):
    global _led
    try:
        import machine
        if _led is None:
            _led = machine.Pin("LED", machine.Pin.OUT)
        _led.value(1 if on else 0)
    except Exception:
        pass


async def blink(pattern_ms, stop):
    on = False
    while not stop[0]:
        on = not on
        led(on)
        await compat.sleep_ms(pattern_ms)


def bootsel_reset_requested():
    """True if BOOTSEL is pressed within 2 s of power-up and held for 3 s."""
    try:
        import rp2
        import time
    except ImportError:
        return False
    try:
        start = time.ticks_ms()
        while not rp2.bootsel_button():
            if time.ticks_diff(time.ticks_ms(), start) > 2000:
                return False
            led((time.ticks_ms() // 250) % 2)
            time.sleep_ms(20)
        log("BOOTSEL held - keep holding 3 s to reset Wi-Fi")
        start = time.ticks_ms()
        while time.ticks_diff(time.ticks_ms(), start) < 3000:
            led((time.ticks_ms() // 60) % 2)
            if not rp2.bootsel_button():
                return False
            time.sleep_ms(20)
        led(False)
        return True
    except Exception:
        return False


async def setup_mode(last_error=""):
    from . import dnsd, portal
    cfg = config.get()
    ap_ssid = cfg.get("ap_ssid") or ("PicoOS-Setup-" + wifi.mac_suffix())
    wifi.set_hostname(cfg.get("hostname") or "pico")
    ip = wifi.start_ap(ap_ssid, cfg.get("ap_password") or "")
    # Pre-scan so the setup page shows networks immediately.
    portal.state["scan"] = wifi.scan()
    stop = [False]
    asyncio.create_task(dnsd.run(ip, stop))
    asyncio.create_task(blink(500, stop))
    srv = portal.build(ap_ssid, last_error)
    await srv.start(compat.HTTP_PORT)
    log("Setup portal ready: join '%s' and open http://%s" % (ap_ssid, ip))
    if cfg.get("ssid"):
        asyncio.create_task(portal.retry_saved(cfg["ssid"], cfg.get("password", ""), cfg.get("hostname", "pico")))
    while True:
        await compat.sleep_ms(10000)
        gc.collect()


async def watchdog(cfg):
    """Keep the Wi-Fi link alive; reconnect if the router drops us."""
    failures = 0
    while True:
        await compat.sleep_ms(15000)
        gc.collect()
        if wifi.is_connected():
            failures = 0
            continue
        failures += 1
        log("Wi-Fi link lost, reconnecting (attempt %d)" % failures)
        ok, _ = await wifi.connect(cfg["ssid"], cfg.get("password", ""), cfg.get("hostname", "pico"), 20000)
        if not ok and failures >= 8:
            log("Network unavailable for too long - rebooting")
            try:
                import machine
                machine.reset()
            except ImportError:
                pass


async def dashboard_mode(cfg, ip):
    from . import api
    wifi.stop_ap()
    led(True)
    srv = api.build()
    await srv.start(compat.HTTP_PORT)
    log("Dashboard ready: http://%s.local  (http://%s)" % (cfg.get("hostname", "pico"), ip))
    await apps.start_all()
    asyncio.create_task(timesvc.run())
    asyncio.create_task(watchdog(cfg))
    while True:
        await compat.sleep_ms(30000)
        gc.collect()


async def boot():
    log("%s %s starting" % (NAME, VERSION))
    cfg = config.load()
    compat.makedirs(apps.APPS_DIR)
    if bootsel_reset_requested():
        log("Wi-Fi settings cleared by BOOTSEL")
        config.set(ssid="", password="")
        cfg = config.get()
    if not cfg.get("ssid"):
        await setup_mode()
        return
    stop = [False]
    asyncio.create_task(blink(120, stop))
    ok, msg = False, ""
    for attempt in range(3):
        ok, msg = await wifi.connect(cfg["ssid"], cfg.get("password", ""), cfg.get("hostname", "pico"), 20000)
        if ok or msg in ("Wrong password",):
            break
        await compat.sleep_ms(2000)
    stop[0] = True
    await compat.sleep_ms(150)
    if ok:
        await dashboard_mode(cfg, msg)
    else:
        await setup_mode("Could not connect to \"%s\": %s" % (cfg["ssid"], msg))


def run():
    try:
        asyncio.run(boot())
    except KeyboardInterrupt:
        log("Stopped (Ctrl+C) - you are now in the REPL")
