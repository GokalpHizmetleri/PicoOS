# Building apps for PicoOS

A PicoOS app is a **static web app**: HTML, CSS, JavaScript, images and fonts, served by the Pico on
its own port. If it runs from a folder in your browser, it will almost certainly run on PicoOS.
Optionally, an app can use the **PicoOS SDK** (data storage, system info, LED, GPIO) and ship a
small **MicroPython backend**.

- [Quick start](#quick-start)
- [App structure](#app-structure)
- [The `picoos.json` manifest](#the-picoosjson-manifest)
- [The PicoOS SDK](#the-picoos-sdk)
- [Python backends](#python-backends)
- [Size and performance tips](#size-and-performance-tips)
- [Testing locally](#testing-locally)
- [Publishing your app](#publishing-your-app)

## Quick start

```html
<!doctype html>
<html>
<head><meta charset="utf-8"><title>My First App</title></head>
<body>
  <h1>Hello from my Pico!</h1>
  <button onclick="count()">Click me</button> <span id="n"></span>
  <script>
    async function count() {
      const r = await fetch("_picoos/data/clicks");          // read from the Pico
      const n = (r.ok ? await r.json() : 0) + 1;
      await fetch("_picoos/data/clicks", { method: "PUT", body: JSON.stringify(n) });  // save on the Pico
      document.getElementById("n").textContent = n + " clicks (saved on the Pico)";
    }
  </script>
</body>
</html>
```

Save it as `my-app.html`, then in the dashboard click **Upload app**, drop the file and press
**Install**. Your app is now at `http://pico.local:808x/`.

The **Hello World** app in the store ([`store/apps/hello-world`](../store/apps/hello-world)) is a
complete template with separate HTML/CSS/JS files.

## App structure

```
my-app/
├── picoos.json     # manifest (needed for the store; optional for uploads)
├── index.html      # start page
├── icon.svg        # 64×64-ish icon, svg or png (recommended)
├── style.css
├── app.js
├── assets/…        # any subfolders
└── backend.py      # optional MicroPython backend
```

On the Pico this is stored as:

```
/apps/my-app/
├── app.json        # metadata written by PicoOS (port, version, source…)
├── www/            # your files, served at http://pico.local:<port>/
└── data/           # values saved through the SDK (kept on update)
```

Rules for serving:

- `/` serves the `entry` page (default `index.html`); a folder URL serves its `index.html`.
- File names starting with `.` and all `*.py` files are **never** served.
- If `foo.js.gz` exists and the browser accepts gzip, it is sent instead of `foo.js` (saves flash).
- Set `"spa": true` to send the entry page for unknown paths without a file extension
  (client-side routing).
- Content types are chosen from the file extension: html, css, js, json, svg, png, jpg, gif, webp,
  ico, woff/woff2, ttf, wasm, mp3, wav, ogg, mp4, webm, csv, xml, txt and more.

**Always use relative URLs** (`style.css`, `_picoos/data/x`, not `/style.css`). Your app is then
reachable both at `http://pico.local:8083/` and at `http://pico.local/apps/my-app/`.

## The `picoos.json` manifest

```json
{
  "id": "my-app",
  "name": "My App",
  "version": "1.2.0",
  "description": "One or two sentences shown in the App Store.",
  "author": "Your Name",
  "category": "Utilities",
  "icon": "icon.svg",
  "color": "#14b8a6",
  "entry": "index.html",
  "backend": "backend.py",
  "spa": false
}
```

| Field | Required | Notes |
|---|---|---|
| `id` | yes | `a-z`, `0-9`, `-`, `_`; max 32 characters. Store apps: must equal the folder name. |
| `name` | yes | Max 40 characters |
| `version` | yes | Any string; the store offers an **Update** when it differs from the installed one |
| `description` | yes | Max 300 characters |
| `author` | no | |
| `category` | no | e.g. `Utilities`, `Productivity`, `Hardware`, `Creativity`, `Information`, `Developer`, `Social` |
| `icon` | no | Path to an icon file in the app, or a single emoji |
| `color` | no | Fallback icon background (hex) |
| `entry` | no | Start page, default `index.html` |
| `backend` | no | MicroPython file to run as the app's backend |
| `spa` | no | Single-page-app fallback routing |
| `root` | no | *Community repos only*: subfolder that contains the app (e.g. `"dist"`) |

## The PicoOS SDK

Every app port also answers these endpoints. Use them with `fetch()` and relative URLs.

| Method & path | Description |
|---|---|
| `GET _picoos/info` | App metadata plus `device_name`, `hostname`, `picoos` version |
| `GET _picoos/system` | `memory`, `storage`, `temperature`, `uptime`, `cpu_freq`, `board`, `version`, and `time` |
| `GET _picoos/time` | `{unix, offset, tz, city, country, synced, mode}`. Local time is `unix + offset`. |
| `GET _picoos/data` | `{keys: [...]}`: the keys stored for this app |
| `GET _picoos/data/<key>` | The stored value (JSON), or `404` if not set |
| `PUT _picoos/data/<key>` | Store the request body (any JSON, max **32 KB** per key) |
| `DELETE _picoos/data/<key>` | Remove a key |
| `GET _picoos/led` | `{on: true/false}` |
| `POST _picoos/led` | Body `{"on": true}`, `{"on": false}` or `{"on": "toggle"}` |
| `GET _picoos/gpio/<pin>` | `{pin, value}`: reads the pin (configured as input on first use) |
| `POST _picoos/gpio/<pin>` | Body `{"mode": "out"\|"in", "value": 0\|1, "pull": "up"\|"down"}` (all optional) |

Keys may contain letters, digits, `-`, `_` and `.` (max 48 characters). Data belongs to the app,
survives updates and is deleted when the app is uninstalled.

GPIO 0–22 and 26–28 are available. Pins 23, 24, 25 and 29 are used by the Wi-Fi chip and are
refused.

### Examples

```js
// Local time on the Pico, formatted in the browser
const t = await fetch("_picoos/time").then(r => r.json());
const local = new Date((t.unix + t.offset) * 1000);
console.log(local.toISOString().slice(11, 19), t.tz, t.city);

// Save and load settings
await fetch("_picoos/data/settings", { method: "PUT", body: JSON.stringify({ theme: "dark" }) });
const settings = await fetch("_picoos/data/settings").then(r => r.ok ? r.json() : {});

// Blink the on-board LED
for (let i = 0; i < 6; i++) {
  await fetch("_picoos/led", { method: "POST", body: JSON.stringify({ on: "toggle" }) });
  await new Promise(r => setTimeout(r, 300));
}

// Drive GPIO 15 high
await fetch("_picoos/gpio/15", { method: "POST", body: JSON.stringify({ mode: "out", value: 1 }) });
```

## Python backends

For logic that must run *on the Pico* (shared state, validation, talking to sensors), add a
`backend.py` and reference it in `picoos.json` (`"backend": "backend.py"`). Uploaded apps that
contain a file named `backend.py` get it automatically.

PicoOS loads the file when the app starts and sends every request for **`api/...`** on the app's
port to your `handle()` function:

```python
# backend.py
import json

sdk = None


def setup(s):
    """Called once when the app starts. `s` is the PicoOS SDK object."""
    global sdk
    sdk = s


def handle(method, path, query, body):
    """
    method: "GET", "POST", ...
    path:   path below /api, e.g. "/hello"
    query:  dict of query-string parameters
    body:   request body as bytes (POST/PUT/PATCH/DELETE, max 16 KB)
    """
    if path == "/hello":
        name = query.get("name", "world")
        return {"message": "Hello, " + name}            # dict/list -> JSON
    if path == "/count" and method == "POST":
        n = sdk.get("count", 0) + 1
        sdk.set("count", n)
        return {"count": n}
    return (404, "application/json", json.dumps({"error": "not found"}))
```

From the browser: `fetch("api/hello?name=Pico")`.

**Return values:** `dict`/`list` → JSON, `str` → text, `None` → `204 No Content`,
`(status, content_type, body)` → full control. `handle` may also be `async def`.

**The `sdk` object:**

| | |
|---|---|
| `sdk.get(key, default=None)` | Read a value from the app's data store (same store as `_picoos/data`) |
| `sdk.set(key, value)` | Write a JSON-serializable value |
| `sdk.led(on=None)` | Get or set the LED (`True`, `False`, `"toggle"`) |
| `sdk.time()` | Same dict as `_picoos/time` |
| `sdk.system()` | Same dict as `_picoos/system` |
| `sdk.log(*args)` | Write to the PicoOS log (Settings → System → Logs) |
| `sdk.app_id` | Your app's id |

Everything in MicroPython is available, including `machine` (I2C, SPI, ADC, PWM…), so a backend can
read a sensor and return its value as JSON.

Keep `handle()` **fast**. PicoOS runs all servers in a single asyncio loop, so a slow, blocking call
stalls the dashboard and every other app. Use `async def handle` and `await asyncio.sleep_ms()` for
anything that waits. Backends run with full access to the device; only install backends you trust.

The **Guestbook** app ([`store/apps/guestbook`](../store/apps/guestbook)) is a complete example.

## Size and performance tips

- The Pico has roughly **2.2 MB** of free flash. Store apps are limited to **1 MB**, community apps
  to 1.5 MB.
- LittleFS uses 4 KB blocks: a 200-byte file still costs about 8 KB. **Prefer a few larger files** to
  many tiny ones.
- Pre-compress large assets: ship `app.js.gz` (and optionally drop `app.js`); PicoOS serves it with
  `Content-Encoding: gzip`.
- Don't depend on CDNs if the app should work without internet; inline small libraries instead.
- The Pico serves roughly 100–300 KB/s. Use lazy loading and keep the first page small.
- Browsers open several connections at once; PicoOS handles them, but dozens of separate image files
  will load slowly. Use SVG sprites or inline SVG.

## Testing locally

You don't need a Pico to try your app:

```bash
python3 tools/simulator.py
```

Then open http://localhost:8080 and upload the app as usual. The simulator runs the real PicoOS code,
including the SDK and Python backends (backends run on CPython there, so stick to MicroPython-compatible
code).

## Publishing your app

### Official store (pull request)

1. Fork this repository.
2. Add your app to `store/apps/<your-app-id>/` with a `picoos.json` (its `id` must match the folder
   name) and an `icon.svg`.
3. Run `python3 tools/update_store.py --offline` to check the manifest (CI also does this).
4. Open a pull request. Once it's merged, CI regenerates `store/catalog.json` and the app appears in
   every PicoOS App Store.

Guidelines: original work, no trackers, no remote code that changes the app's behaviour after review,
works offline where possible, and English UI text.

### Listing an existing open-source project

Already have a static web app on GitHub (or found a great one)? It can be listed **without copying
any code**. Add an entry to `store/sources.json`:

```json
{
  "id": "my-game",
  "repo": "someone/my-game",
  "branch": "main",
  "root": "",
  "entry": "index.html",
  "name": "My Game",
  "description": "What it is, in one or two sentences.",
  "category": "Games",
  "icon": "🎮",
  "include": ["index.html", "js/*", "css/*", "img/*"]
}
```

Then check what would be installed and test it:

```bash
python3 tools/update_store.py --inspect someone/my-game@main
python3 tools/update_store.py && node tests/store_apps_test.js my-game
```

Requirements: a permissive or copyleft open-source license, runs from plain files without a build
step, ≤ 900 KB and ≤ 60 files after `include`/`exclude`. The store shows the repository, its stars
and license, and links to the source. Users download the files straight from the project's repository
at the pinned commit; CI moves the pin forward daily.

### Community (no pull request needed)

1. Create a **public** GitHub repository with your app files. `index.html` (or your `entry`) goes in
   the repository root, or in the folder named by `root`.
2. Add a `picoos.json` manifest at the repository root (recommended; otherwise the repo name and
   description are used).
3. Add the topic **`picoos-app`** to the repository (*About → ⚙️ → Topics*).

PicoOS finds it through GitHub search and lists it under **Community**, sorted by stars. Files are
picked by extension (web files plus `.py`); README/LICENSE files and dotfiles are skipped.
