# User guide

- [The dashboard](#the-dashboard)
- [Opening and managing apps](#opening-and-managing-apps)
- [The App Store](#the-app-store)
- [Uploading your own app](#uploading-your-own-app)
- [Settings](#settings)

## The dashboard

Open **http://pico.local** (or the hostname you chose) on any device in your network.

<img src="images/dashboard.webp" alt="Dashboard">

| Area | What it shows |
|---|---|
| **Top bar** | Device name and address, the Wi-Fi network (click it for network details), **App Store**, **Upload app** and **Settings** |
| **Clock** | Local time and date for your location, the detected city, time zone and UTC offset. A green dot means the clock is synchronized with the internet. |
| **Storage** | Ring chart of used flash, split into **Apps** (your installed apps and their data) and **System** (configuration, filesystem overhead), plus free space |
| **System** | Chip temperature, uptime, IP address, Wi-Fi signal strength, memory usage, PicoOS/MicroPython version and CPU clock |
| **Apps** | All installed apps. A green dot and the port number mean the app is running. |

The dashboard refreshes itself every 10 seconds. If the Pico becomes unreachable, a red banner appears
at the top and disappears again once it's back.

### Where does the time come from?

The clock is **not** your device's clock. The Pico sets its own clock from NTP time servers
(`pool.ntp.org`, `time.google.com`, `time.cloudflare.com`). It then asks
[ip-api.com](https://ip-api.com) where your internet connection is located, which gives the city and
the time zone offset, including daylight saving time. The offset is refreshed every 6 hours, so DST
changes are picked up automatically. If you'd rather set the time zone yourself, see
[Date & time](#date--time).

On a phone the layout stacks: clock, then apps, then storage and system.

<img src="images/mobile-dashboard.webp" width="300" alt="Mobile">

## Opening and managing apps

**Click an app** to open it in a new tab. Every app is a small website with its own port:
`http://pico.local:8081`, `http://pico.local:8082`, and so on.

Hover over an app and click **⋮** (or right-click / long-press it) for more options:

<img src="images/app-menu.webp" alt="App menu">

| Action | |
|---|---|
| **Open** | Opens the app on its own port |
| **Open inside dashboard port** | Opens the same app at `http://pico.local/apps/<id>/`. Useful if your network blocks high ports. |
| **Details** | Version, author, size, source (store, community or upload), address |
| **Stop / Start** | A stopped app keeps its files and data but doesn't run a web server |
| **Uninstall** | Deletes the app **and its saved data** |

## The App Store

Click **App Store** in the top bar.

<img src="images/app-store.webp" alt="App Store">

- **Official:** apps from the `store/` folder of the PicoOS GitHub repository. The catalog is rebuilt
  automatically whenever an app is added or updated there.
- **Community:** public GitHub repositories with the topic **`picoos-app`**. Apps larger than
  1.5 MB are hidden because they won't fit.
- Filter by category, or search by name, description or author.

Every card shows the app's size. The size tag is **green** when it fits in the Pico's free space and
**red** when it doesn't. The button changes to match:

| Button | Meaning |
|---|---|
| **Install** | Fits; click to install |
| **Update** | Installed, and a newer version is available. Updating keeps the app's port and its saved data. |
| **Open** | Installed and up to date |
| **No space** | Not enough free flash; uninstall something first |
| **Too big** | Bigger than the Pico's whole storage |

When you click **Install**, *your browser* downloads the app's files from GitHub and uploads them
to the Pico, with a progress bar on the card. The browser therefore needs internet access; the Pico
itself only talks to your local network during the install. When the install finishes, the app
appears on the home screen and is already running.

> The store reads from `GokalpHizmetleri/PicoOS@main` by default. You can point it at a fork or
> branch in *Settings → App Store*.

## Uploading your own app

Click **Upload app**. You can give PicoOS:

| Input | Example |
|---|---|
| A single HTML file | `game.html` with inline CSS/JS |
| Several files | `index.html`, `style.css`, `app.js`, `logo.png` |
| A folder | Choose folder → your project folder (subfolders are kept) |
| A `.zip` archive | A zipped project; one top-level folder inside the zip is removed automatically |

You can also drag and drop any of these onto the upload area.

<img src="images/upload.webp" alt="Upload">

Then:

1. Check the **name** (taken from the page's `<title>`) and the **App ID** (used in the URL, a–z,
   0–9, `-`, `_`).
2. Pick the **start page** if there is more than one HTML file.
3. Choose an **icon**. If your upload contains `icon.svg`/`icon.png` (or `favicon.svg/png`), that
   file is used instead.
4. The green/red box tells you whether it fits, including LittleFS block overhead.
5. Press **Install**.

Uploading with the ID of an app that's already installed replaces that app but keeps its data and port.

If the upload contains a `backend.py`, PicoOS runs it as the app's
[MicroPython backend](app-development.md#python-backends).

Want your app to read and store data on the Pico? See **[App development](app-development.md)**.

## Settings

Click the ⚙️ button.

<img src="images/settings.webp" alt="Settings">

### General
- **Device name**: shown in the dashboard and the browser tab.
- **Hostname**: the dashboard address is `http://<hostname>.local`. Changing it restarts PicoOS,
  and the dashboard moves to the new address.
- **Wallpaper**: six built-in backgrounds.
- **12-hour clock**: stored in this browser only.

### Date & time
- **Automatic (by location)**: time zone from IP geolocation (default).
- **Manual**: choose a UTC offset and an optional label. Use this if you're behind a VPN or the
  detected location is wrong. Manual offsets don't change for daylight saving time automatically.
- **Sync now**: syncs NTP and the location immediately.

### Network
- Current network, IP address, signal strength, MAC address.
- **Change Wi-Fi network**: scan, choose, enter a password, and PicoOS restarts on the new
  network. If that fails, the setup access point appears.
- **Forget Wi-Fi & restart setup**: back to the first-run setup.

### App Store
- **Repository / branch** the official catalog is loaded from (`owner/repo` + branch). Change it to
  run your own app store from a fork.

### System
- Version information, **Restart PicoOS**, and the **log** of the last ~120 events (connections,
  installs, errors).
