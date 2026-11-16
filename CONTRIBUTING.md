# Contributing to PicoOS

Thanks for helping! Contributions of all sizes are welcome: bug reports, docs, store apps and code.

## Submitting an app to the store

See [docs/app-development.md → Publishing your app](docs/app-development.md#publishing-your-app).
In short: add `store/apps/<id>/` with a `picoos.json` and an `icon.svg`, run
`python3 tools/update_store.py --offline`, and open a pull request.

## Working on PicoOS itself

```bash
python3 tools/simulator.py         # run the dashboard locally on http://localhost:8080
python3 tests/smoke_test.py        # end-to-end tests
./tools/build_firmware.sh          # build dist/PicoOS-pico2w.uf2
```

Guidelines:

- PicoOS code runs on **MicroPython**: stick to the subset that exists there (no `pathlib`,
  `dataclasses`, f-string `=` specifiers, etc.). Test with the unix port:
  `python3 tests/smoke_test.py --micropython <path-to-micropython>`.
- The web UI must work **offline** (the setup portal has no internet): no CDNs, fonts or frameworks.
- Keep RAM in mind: stream files instead of reading them whole, and avoid large temporary strings.
- User-facing text is in English.
- See [docs/building.md](docs/building.md) and [docs/architecture.md](docs/architecture.md).
