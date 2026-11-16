# Building from source

- [Build the UF2 firmware](#build-the-uf2-firmware)
- [Desktop simulator](#desktop-simulator)
- [Tests](#tests)
- [Regenerating the App Store catalog](#regenerating-the-app-store-catalog)
- [Regenerating the screenshots](#regenerating-the-screenshots)
- [Continuous integration](#continuous-integration)
- [Making a release](#making-a-release)

## Build the UF2 firmware

Requirements (Debian/Ubuntu):

```bash
sudo apt install git make cmake python3 gcc-arm-none-eabi libnewlib-arm-none-eabi libstdc++-arm-none-eabi-newlib
```

Build:

```bash
./tools/build_firmware.sh
```

The script:

1. clones MicroPython **v1.29.0** into `build/micropython` (or uses `MICROPYTHON_DIR`),
2. bundles the web UI into `firmware/picoos/assets.py` (`tools/build_assets.py`),
3. builds `mpy-cross` and fetches the rp2 submodules (pico-sdk, cyw43-driver, lwIP, btstack…),
4. builds MicroPython with the `firmware/board/PICOOS_PICO2W` board definition, which freezes
   `firmware/main.py` and the `firmware/picoos` package into the image,
5. copies the result to `dist/PicoOS-pico2w.uf2` (plus a versioned copy).

Environment variables:

| Variable | Default | |
|---|---|---|
| `MICROPYTHON_DIR` | `build/micropython` | Use an existing MicroPython checkout |
| `MP_VERSION` | `v1.29.0` | Tag to clone |
| `JOBS` | number of CPUs | Parallel build jobs |

A first build takes a few minutes (mostly fetching submodules); rebuilds take seconds.

> **Changing the web UI or Python code?** Rebuild the firmware. The UI is embedded in the image,
> nothing is read from the filesystem.

### Trying changes on a real Pico without rebuilding

You can run modified Python code on a board that already has PicoOS: stop PicoOS with Ctrl+C,
copy your changed `picoos` package to `/lib` with `mpremote`, and start it with `/lib` searched
first:

```bash
python3 tools/build_assets.py
mpremote mkdir :lib ; mpremote cp -r firmware/picoos :lib/
mpremote exec "import sys; sys.path.insert(0, '/lib'); import picoos.main; picoos.main.run()"
```

A normal boot still runs the frozen copy (the entry point puts `.frozen` first in `sys.path`).
Delete `/lib/picoos` when you're done.

## Desktop simulator

`tools/simulator.py` runs the real PicoOS code on CPython 3.9+ with fake `network`, `machine`
and `ntptime` modules:

```bash
python3 tools/simulator.py              # dashboard → http://localhost:8080
python3 tools/simulator.py --setup      # setup portal → http://localhost:8080
python3 tools/simulator.py --reset      # start with an empty filesystem
python3 tools/simulator.py --port 9000  # different port
```

- The simulated flash is the folder `.simfs/`, with a reported capacity of 2.5 MB.
- Fake Wi-Fi networks show up in scans; the password `wrong` simulates an authentication failure.
- Apps run on ports 8081+ exactly like on the device.
- The time zone is fixed to Europe/Istanbul, so it works offline.
- A "reboot" restarts the simulator process.

## Tests

`tests/smoke_test.py` starts PicoOS and runs ~45 end-to-end checks against the real HTTP API:
status, installing store apps, serving on app ports, the SDK, Python backends, updates, stop/start,
validation, settings and uninstalling.

```bash
python3 tests/smoke_test.py                                   # on CPython (simulator)
python3 tests/smoke_test.py --micropython ./micropython       # on the MicroPython unix port
```

To build the MicroPython unix port:

```bash
cd build/micropython/ports/unix
make submodules && make MICROPY_PY_FFI=0
# binary: build-standard/micropython
```

Running on the unix port catches MicroPython-specific problems (missing stdlib features, asyncio
differences) without hardware. `tests/fakes/` contains the MicroPython versions of the fake hardware
modules, and `tests/run_micropython.py` is the entry point.

## Regenerating the App Store catalog

```bash
python3 tools/build_catalog.py          # rewrite store/catalog.json
python3 tools/build_catalog.py --check  # exit 1 if it's out of date
```

It validates every `store/apps/<id>/picoos.json`, checks that the entry file exists and the app is
≤ 1 MB, and lists all files with their sizes.

## Regenerating the screenshots

```bash
npm install playwright && npx playwright install chromium   # once
node tools/screenshots.js
```

This starts two simulators, installs store apps, and writes `docs/images/*.png`. GitHub requests are
answered from your local checkout.

## Continuous integration

`.github/workflows/build.yml`:

| Job | What it does |
|---|---|
| **test** | Python syntax check, catalog check, smoke test on CPython |
| **firmware** | Builds MicroPython's unix port and runs the smoke test on it, then builds the UF2 and uploads it as an artifact. On a `v*` tag it attaches the UF2 to a GitHub release. |

`.github/workflows/catalog.yml` regenerates `store/catalog.json` whenever something under
`store/apps/` changes on `main` and commits it. That's what keeps the App Store current without
anyone editing JSON by hand.

## Making a release

1. Bump `VERSION` in `firmware/picoos/__init__.py`.
2. Build: `./tools/build_firmware.sh` and commit `dist/PicoOS-pico2w.uf2`.
3. Tag: `git tag v1.1.0 && git push --tags`. CI builds the UF2 again and publishes the release.
