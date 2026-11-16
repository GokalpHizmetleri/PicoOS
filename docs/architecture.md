# Architecture & API reference

- [Overview](#overview)
- [Boot sequence](#boot-sequence)
- [Setup mode](#setup-mode)
- [Dashboard mode](#dashboard-mode)
- [Filesystem layout](#filesystem-layout)
- [Ports](#ports)
- [How installing works](#how-installing-works)
- [Explore GitHub (browser-side store)](#explore-github-browser-side-store)
- [The App Store catalog](#the-app-store-catalog)
- [Time keeping](#time-keeping)
- [Source tree](#source-tree)
- [HTTP API](#http-api)
- [Security](#security)

## Overview

PicoOS is a MicroPython application **frozen into a custom MicroPython firmware** for the
Raspberry Pi Pico 2 W. Frozen code and the gzipped web UI live in the firmware's flash area, so they
use no RAM until they are needed and can't be deleted by accident. All user data (settings, apps,
app data) lives on the LittleFS filesystem in the remaining flash.

| Component | Details |
|---|---|
| MCU / radio | RP2350 (2× Cortex-M33 @ 150 MHz, 520 KB RAM), CYW43439 2.4 GHz Wi-Fi |
| Firmware | MicroPython v1.29.0, board definition `firmware/board/PICOOS_PICO2W` |
| Flash layout | 4 MB = 1.5 MB firmware (≈930 KB used) + 2.5 MB LittleFS |
| Networking | lwIP, built-in mDNS responder (`<hostname>.local`), DHCP |
| Concurrency | One `asyncio` event loop: web servers, DNS, time sync, Wi-Fi watchdog |
| Web UI | Vanilla HTML/CSS/JS, no frameworks or CDNs (works offline), ~29 KB gzipped |

The board definition raises lwIP's `MEMP_NUM_TCP_PCB` to 32 and `MEMP_NUM_TCP_PCB_LISTEN` to 24, so
PicoOS can run one listening server per app and still serve browsers that open several connections.

## Boot sequence

```
power on
  │
  ├─ MicroPython mounts LittleFS (formats it on first boot)
  ├─ frozen main.py → picoos.main.run()
  ├─ load /.picoos/config.json
  ├─ BOOTSEL pressed within 2 s and held 3 s? ── yes ──► forget Wi-Fi
  │
  ├─ no SSID saved ─────────────────────────────────────────► SETUP MODE
  │
  └─ connect STA (3 attempts × 20 s, LED blinks fast)
        ├─ connected ───────────────────────────────────────► DASHBOARD MODE
        └─ failed (reason shown on setup page) ─────────────► SETUP MODE (+ retry every 3 min)
```

## Setup mode

- Starts the access point `PicoOS-Setup-<last 4 MAC hex digits>` (open by default; set `ap_password`
  in the config for WPA2) at `192.168.4.1`.
- **Captive DNS** (`picoos/dnsd.py`): a UDP server on port 53 that answers every query with
  `192.168.4.1`, so phones open the setup page automatically.
- **Portal** on port 80 (`picoos/portal.py`): the setup page plus a small API. Any unknown URL
  (captive-portal probes like `/generate_204` or `/hotspot-detect.html`) gets a `302` redirect to the
  setup page.
- Connecting: the credentials are tested **while the AP stays up**, so a wrong password is reported
  on the page right away. On success the config is saved and the board restarts after 9 seconds.
- With a saved but unreachable network, the saved network is retried every 3 minutes, as long as no
  device is connected to the AP.

## Dashboard mode

- Access point off; LED solid.
- Dashboard + REST API on port 80 (`picoos/api.py`).
- All enabled apps start their own servers (`picoos/apps.py`).
- `timesvc.run()` syncs NTP and the location at start, then every 6 hours (every 2 minutes until it
  succeeds).
- Watchdog: checks the link every 15 s and reconnects. After 8 failed reconnects in a row it restarts
  the board, which falls back to setup mode if the network is really gone.

## Filesystem layout

```
/
├── .picoos/
│   └── config.json          # settings (incl. Wi-Fi password)
└── apps/
    ├── .staging/<id>/       # temporary, during an install (cleared at boot)
    └── <id>/
        ├── app.json         # metadata: name, version, port, enabled, source, entry, backend…
        ├── www/             # served files
        └── data/            # SDK key/value storage (one file per key)
```

`config.json` keys: `ssid`, `password`, `hostname`, `device_name`, `tz_mode` (`auto`/`manual`),
`tz_offset` (minutes), `tz_name`, `ap_ssid`, `ap_password`, `store_repo`, `store_branch`,
`wallpaper`.

## Ports

| Port | Used by |
|---|---|
| 53/udp | Captive DNS (setup mode only) |
| 80 | Setup portal or dashboard + API |
| 8081–8100 | Installed apps, one port each (max 20 apps). A port is assigned at install and kept on updates; freed ports are reused. |

## How installing works

The **browser** fetches app files from GitHub (`raw.githubusercontent.com`, CORS-enabled) and
streams each file to the Pico:

```
POST /api/apps/install/begin   {id, name, version, …, size, files}   → free-space check, staging dir
PUT  /api/apps/install/file?id=<id>&path=<rel>   <raw bytes>          → streamed straight to flash
   … one PUT per file …
POST /api/apps/install/commit  {id}                                    → move into /apps/<id>, start server
POST /api/apps/install/abort   {id}                                    → on error
```

Why the browser does the download:

- No TLS on the Pico. HTTPS to GitHub would need lots of RAM and an accurate clock, and would be slow.
- The same protocol handles your own uploads (files, folders, `.zip` unpacked in the browser with
  `DecompressionStream`).

Request bodies are written to flash in 2 KB chunks, so the size of an app is never limited by RAM.
Free space is checked when the install starts (estimated with LittleFS block overhead) and again for
every file. 64 KB is always kept free for the system.

Updating an app keeps its port, its `installed_at` time, its enabled state and its `data/` folder.

## Explore GitHub (browser-side store)

`firmware/web/dashboard/explore.js` implements a store with no server and no catalog:

| Step | Service | Notes |
|---|---|---|
| Search | `api.github.com/search/repositories` | 30 results per page; `fork:false archived:false size:<60000` added to every query; optional user token from localStorage |
| File list | `data.jsdelivr.com/v1/packages/gh/<repo>@<branch>?structure=flat` | free, CORS-enabled, no GitHub rate limit; `gh-pages` is checked too when the repo has Pages |
| Start page | `raw.githubusercontent.com/<repo>/<branch>/<root>/index.html` | build-step detection, missing script/style detection, `/<repo>/` base-path detection, CDN detection |
| Download | `raw.githubusercontent.com/...` | one request per file, streamed to `PUT /api/apps/install/file` |

Results are cached in localStorage per `repo@pushed_at` (up to 250 repos) and searches in
sessionStorage for 15 minutes. Six repositories are checked in parallel. The installed app stores
`version = pushed_at`, `source = "github"`, `repo` and `base_prefix`.

`base_prefix` (e.g. `/my-game/`) is set for sites built for a GitHub Pages project URL; the app
server strips it from request paths so `/my-game/js/app.js` serves `js/app.js`.

## The App Store catalog

`store/catalog.json` is a static file in this repository, so the store needs no server. Every entry
lists its files and sizes, so the dashboard can check free space before downloading anything.

```json
{
  "id": "2048", "name": "2048", "source": "github",
  "repo": "gabrielecirulli/2048", "branch": "master", "ref": "478b6ec3…", "version": "478b6ec",
  "base": "https://raw.githubusercontent.com/gabrielecirulli/2048/478b6ec3…/",
  "entry": "index.html", "license": "MIT", "stars": 13475, "internet": false,
  "size": 141824, "files": [{"path": "index.html", "size": 3988}, …]
}
```

- **`source: "picoos"`**: files come from `store/apps/<id>/` in the store repository.
- **`source: "github"`**: files come from the project's own repository, pinned to the commit in
  `ref`. `version` is the short commit hash, so a new upstream commit means a new version.
  A file entry may carry `src` when it is stored under a different name upstream (`rename`).

The daily CI job (`tools/update_store.py`) moves the pins forward. Because downloads use exact
commits, the file list in the catalog always matches what gets downloaded.

## Time keeping

1. `ntptime.settime()` against `pool.ntp.org`, `time.google.com`, `time.cloudflare.com` sets the
   RTC to UTC.
2. `GET http://ip-api.com/json/?fields=…` returns `city`, `country`, `timezone` and the current
   `offset` in seconds (including DST).
3. Fallback: `http://worldtimeapi.org/api/ip` gives the offset and can also set the clock when NTP is
   blocked.

The dashboard receives `unix` and `offset` and keeps ticking locally with `performance.now()`
between refreshes, so the clock shows the **Pico's** time, not the viewer's device time.

## Source tree

```
firmware/
├── main.py                     # frozen entry point
├── picoos/
│   ├── __init__.py             # version
│   ├── main.py                 # boot sequence, LED, watchdog
│   ├── compat.py               # filesystem helpers, MicroPython/CPython compatibility
│   ├── config.py               # /.picoos/config.json
│   ├── wifi.py                 # STA/AP/scan
│   ├── dnsd.py                 # captive DNS
│   ├── http.py                 # asyncio HTTP server + router
│   ├── portal.py               # setup mode
│   ├── api.py                  # dashboard + REST API
│   ├── apps.py                 # app manager, per-app servers, SDK, backends
│   ├── timesvc.py              # NTP + geolocation
│   ├── sysinfo.py              # storage, memory, temperature, uptime
│   ├── log.py                  # ring-buffer log
│   └── assets.py               # GENERATED: gzipped web UI (tools/build_assets.py)
├── web/                        # web UI sources (dashboard + setup page)
└── board/PICOOS_PICO2W/        # MicroPython board definition + frozen manifest
store/
├── catalog.json                # GENERATED by tools/update_store.py (CI, daily)
├── sources.json                # open-source GitHub projects listed in the store
└── apps/<id>/                  # apps made for PicoOS
tools/                          # build scripts, simulator, screenshots
tests/                          # smoke test + MicroPython unix-port harness
```

## HTTP API

All endpoints return JSON. Errors look like `{"ok": false, "error": "message"}` with a matching
status code (400, 404, 405, 409, 413, 500, 507 = not enough storage).

### Dashboard mode (port 80)

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/status` | – | `{device, system, time, wifi, apps, settings}`: everything the dashboard shows |
| GET | `/api/system` | – | storage, memory, temperature, uptime, versions |
| GET | `/api/time` | – | `{unix, offset, tz, city, region, country, synced, source, mode, located}` |
| POST | `/api/time/sync` | – | resync NTP + location |
| GET | `/api/apps` | – | `{apps: [...], free, max_apps}` |
| POST | `/api/apps/install/begin` | app metadata + `size`, `files` | `{ok, app}` |
| PUT | `/api/apps/install/file` | `?id=&path=`, raw body | `{ok, path}` |
| POST | `/api/apps/install/commit` | `{id}` | `{ok, app}` |
| POST | `/api/apps/install/abort` | `{id}` | `{ok}` |
| GET | `/api/apps/<id>/icon` | – | icon file |
| POST | `/api/apps/<id>/enable` | `{enabled: bool}` | `{ok, app}` |
| DELETE | `/api/apps/<id>` | – | `{ok}` |
| * | `/apps/<id>/…` | – | the app's files; `_picoos/…` and `api/…` are forwarded to the app |
| GET | `/api/settings` | – | config without passwords |
| POST | `/api/settings` | any of `device_name, hostname, tz_mode, tz_offset, tz_name, store_repo, store_branch, wallpaper` | `{ok, settings, rebooting}` |
| GET | `/api/wifi/scan` | – | `{networks: [{ssid, rssi, channel, secure}]}` |
| POST | `/api/wifi` | `{ssid, password}` | saves and restarts |
| POST | `/api/wifi/forget` | – | clears Wi-Fi and restarts into setup |
| POST | `/api/system/reboot` | – | restarts |
| GET | `/api/logs` | – | `{lines: [...]}` |

An app object looks like:

```json
{
  "id": "notes", "name": "Notes", "version": "1.0.0", "description": "…", "author": "PicoOS",
  "icon": "icon.svg", "color": "#fbbf24", "category": "Productivity", "entry": "index.html",
  "backend": "", "spa": false, "source": "store", "repo": "GokalpHizmetleri/PicoOS",
  "port": 8081, "enabled": true, "running": true, "size": 13824,
  "installed_at": 1794827032, "updated_at": 1794827032, "has_icon_file": true
}
```

### Setup mode (port 80)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/setup/state` | – | `{ap_ssid, device_name, hostname, saved_ssid, last_error, mac}` |
| GET | `/api/setup/scan` | `?refresh=1` to rescan | `{networks: [...]}` |
| POST | `/api/setup/connect` | `{ssid, password, hostname, device_name}` | `{ok}`, then the attempt runs in the background |
| GET | `/api/setup/status` | – | `{state: idle\|connecting\|ok\|failed, message, ip, hostname}` |

### App ports (8081+)

See [the SDK reference](app-development.md#the-picoos-sdk).

## Security

PicoOS is designed for a **home network you trust**:

- There is **no login**. Anyone on your network can open the dashboard, install or remove apps and
  change settings.
- Traffic is plain HTTP.
- The setup access point is **open** by default, and the Wi-Fi password is sent over it once during
  setup. Set `ap_password` in `/.picoos/config.json` (via the REPL) if you want a WPA2-protected
  setup network.
- App **Python backends run with full device access**, and app pages run in your browser. Only
  install apps and backends you trust, just as with any software.
- The Wi-Fi password is stored in plain text in `/.picoos/config.json` on the device (never returned
  by the API).

Don't expose PicoOS ports to the internet through port forwarding.
