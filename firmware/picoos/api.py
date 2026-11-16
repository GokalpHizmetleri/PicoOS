# PicoOS - dashboard web server (normal mode, http://pico.local).
import asyncio

from . import VERSION, apps, compat, config, sysinfo, timesvc, wifi
from .http import Server
from .log import log, lines

SETTINGS_KEYS = ("device_name", "hostname", "tz_mode", "tz_offset", "tz_name",
                 "store_repo", "store_branch", "wallpaper")


async def _reset_later(ms):
    await compat.sleep_ms(ms)
    log("Rebooting...")
    try:
        import machine
        machine.reset()
    except ImportError:
        log("(simulator: reboot skipped)")


def build():
    srv = Server("dashboard")
    from . import assets
    files = assets.FILES

    def asset_route(name):
        async def h(req, res):
            ctype, data = files[name]
            await res.asset(data, ctype)
        return h

    srv.add("GET", "/", asset_route("/index.html"))
    for name in files:
        if name not in ("/setup.html",):  # includes /catalog.json (built-in store snapshot)
            srv.add("GET", name, asset_route(name))

    # -- status ---------------------------------------------------------
    async def h_status(req, res):
        await res.json({
            "device": {
                "name": config.get("device_name"),
                "hostname": config.get("hostname"),
                "version": VERSION,
            },
            "build": getattr(assets, "BUILD", {}),
            "system": sysinfo.snapshot(),
            "time": timesvc.snapshot(),
            "wifi": wifi.info(),
            "apps": apps.list_apps(),
            "settings": config.public(),
        })

    async def h_system(req, res):
        await res.json(sysinfo.snapshot())

    async def h_time(req, res):
        await res.json(timesvc.snapshot())

    async def h_time_sync(req, res):
        ok = timesvc.sync_ntp()
        await timesvc.geolocate()
        await res.json({"ok": ok, "time": timesvc.snapshot()})

    # -- apps -----------------------------------------------------------
    async def h_apps(req, res):
        total, free = compat.statvfs()
        await res.json({"apps": apps.list_apps(), "free": max(0, free - apps.RESERVE),
                        "max_apps": apps.MAX_APPS})

    async def h_app_icon(req, res):
        p = apps.icon_path(req.params["id"])
        if not p:
            await res.error(404, "No icon")
            return
        await res.file(p, headers={"Cache-Control": "max-age=300"})

    async def h_begin(req, res):
        info = await req.json()
        try:
            m = apps.install_begin(info)
        except MemoryError as e:
            await res.error(507, str(e))
            return
        except ValueError as e:
            await res.error(400, str(e))
            return
        await res.json({"ok": True, "app": m})

    async def h_file(req, res):
        try:
            rel = await apps.install_file(req, req.query.get("id", ""), req.query.get("path", ""))
        except MemoryError as e:
            await res.error(507, str(e))
            return
        except ValueError as e:
            await res.error(400, str(e))
            return
        await res.json({"ok": True, "path": rel})

    async def h_commit(req, res):
        body = await req.json()
        try:
            app = await apps.install_commit(body.get("id", ""))
        except (ValueError, OSError) as e:
            await res.error(400, str(e))
            return
        await res.json({"ok": True, "app": app})

    async def h_abort(req, res):
        body = await req.json()
        apps.install_abort(body.get("id", ""))
        await res.json({"ok": True})

    async def h_app_delete(req, res):
        try:
            await apps.uninstall(req.params["id"])
        except ValueError as e:
            await res.error(404, str(e))
            return
        await res.json({"ok": True})

    async def h_app_enable(req, res):
        body = await req.json()
        try:
            app = await apps.set_enabled(req.params["id"], body.get("enabled", True))
        except ValueError as e:
            await res.error(404, str(e))
            return
        await res.json({"ok": True, "app": app})

    async def h_app_files(req, res):
        app_id = req.params["id"]
        m = apps.meta(app_id)
        if not m:
            await res.error(404, "App not found")
            return
        m["id"] = app_id
        tail = req.params.get("*", "")
        if not tail and not req.path.endswith("/"):
            await res.redirect("/apps/%s/" % app_id)
            return
        host = apps.hosts.get(app_id)
        if host and (tail.startswith("_picoos/") or tail.startswith("api/")):
            # Forward SDK / backend calls so apps also work under /apps/<id>/.
            req.path = "/" + tail
            await host.server.dispatch(req, res)
            return
        if req.method not in ("GET", "HEAD"):
            await res.error(405, "Method not allowed")
            return
        await apps.serve_static(app_id, m, req, res, tail)

    # -- settings -------------------------------------------------------
    async def h_settings_get(req, res):
        await res.json(config.public())

    async def h_settings_post(req, res):
        body = await req.json()
        upd = {}
        for k in SETTINGS_KEYS:
            if k in body:
                upd[k] = body[k]
        if "hostname" in upd:
            h = "".join(c for c in str(upd["hostname"]).lower() if c.isalpha() or c.isdigit() or c == "-")[:24]
            upd["hostname"] = h or "pico"
        if "tz_offset" in upd:
            try:
                upd["tz_offset"] = max(-720, min(840, int(upd["tz_offset"])))
            except ValueError:
                upd.pop("tz_offset")
        restart = "hostname" in upd and upd["hostname"] != config.get("hostname")
        config.set(**upd)
        log("Settings updated:", ", ".join(upd.keys()))
        if restart:
            asyncio.create_task(_reset_later(1500))
        await res.json({"ok": True, "settings": config.public(), "rebooting": restart})

    async def h_wifi_scan(req, res):
        await res.json({"networks": wifi.scan()})

    async def h_wifi_set(req, res):
        body = await req.json()
        ssid = (body.get("ssid") or "").strip()
        if not ssid:
            await res.error(400, "SSID required")
            return
        config.set(ssid=ssid, password=body.get("password") or "")
        log("Wi-Fi network changed to", ssid)
        asyncio.create_task(_reset_later(1500))
        await res.json({"ok": True, "rebooting": True})

    async def h_wifi_forget(req, res):
        config.set(ssid="", password="")
        log("Wi-Fi credentials cleared")
        asyncio.create_task(_reset_later(1500))
        await res.json({"ok": True, "rebooting": True})

    async def h_reboot(req, res):
        asyncio.create_task(_reset_later(1000))
        await res.json({"ok": True, "rebooting": True})

    async def h_logs(req, res):
        await res.json({"lines": lines()})

    srv.add("GET", "/api/status", h_status)
    srv.add("GET", "/api/system", h_system)
    srv.add("GET", "/api/time", h_time)
    srv.add("POST", "/api/time/sync", h_time_sync)
    srv.add("GET", "/api/apps", h_apps)
    srv.add("POST", "/api/apps/install/begin", h_begin)
    srv.add("PUT", "/api/apps/install/file", h_file)
    srv.add("POST", "/api/apps/install/commit", h_commit)
    srv.add("POST", "/api/apps/install/abort", h_abort)
    srv.add("GET", "/api/apps/:id/icon", h_app_icon)
    srv.add("POST", "/api/apps/:id/enable", h_app_enable)
    srv.add("DELETE", "/api/apps/:id", h_app_delete)
    srv.add("*", "/apps/:id/*", h_app_files)
    srv.add("GET", "/api/settings", h_settings_get)
    srv.add("POST", "/api/settings", h_settings_post)
    srv.add("GET", "/api/wifi/scan", h_wifi_scan)
    srv.add("POST", "/api/wifi", h_wifi_set)
    srv.add("POST", "/api/wifi/forget", h_wifi_forget)
    srv.add("POST", "/api/system/reboot", h_reboot)
    srv.add("GET", "/api/logs", h_logs)
    return srv
