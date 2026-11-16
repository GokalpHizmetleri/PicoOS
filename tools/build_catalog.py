#!/usr/bin/env python3
"""Generate store/catalog.json from the apps in store/apps/<id>/.

Each app folder contains a picoos.json manifest plus its web files. The catalog
lists every file with its size so the dashboard can check free space on the
Pico before installing. CI runs this on every push, so the App Store is always
in sync with the repository.

    python3 tools/build_catalog.py           # write store/catalog.json
    python3 tools/build_catalog.py --check   # fail if catalog.json is outdated
"""
import datetime
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = os.path.join(ROOT, "store")
APPS = os.path.join(STORE, "apps")
OUT = os.path.join(STORE, "catalog.json")
MAX_APP_BYTES = 1024 * 1024
REQUIRED = ("id", "name", "version", "description")


def collect(app_dir):
    files = []
    for base, dirs, names in os.walk(app_dir):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        for n in sorted(names):
            if n.startswith(".") or n == "picoos.json":
                continue
            full = os.path.join(base, n)
            rel = os.path.relpath(full, app_dir).replace(os.sep, "/")
            files.append({"path": rel, "size": os.path.getsize(full)})
    return files


def build():
    apps = []
    for app_id in sorted(os.listdir(APPS)):
        d = os.path.join(APPS, app_id)
        man_path = os.path.join(d, "picoos.json")
        if not os.path.isfile(man_path):
            continue
        with open(man_path, encoding="utf-8") as f:
            man = json.load(f)
        for k in REQUIRED:
            if k not in man:
                raise SystemExit("%s: picoos.json is missing '%s'" % (app_id, k))
        if man["id"] != app_id:
            raise SystemExit("%s: id in picoos.json must match the folder name" % app_id)
        files = collect(d)
        entry = man.get("entry", "index.html")
        if not any(f["path"] == entry for f in files):
            raise SystemExit("%s: entry file %s not found" % (app_id, entry))
        size = sum(f["size"] for f in files)
        if size > MAX_APP_BYTES:
            raise SystemExit("%s: %d bytes is too large for the store (max %d)" % (app_id, size, MAX_APP_BYTES))
        app = dict(man)
        app.setdefault("entry", "index.html")
        app.update({"path": "store/apps/" + app_id, "size": size, "files": files})
        apps.append(app)
    return apps


def main():
    apps = build()
    old = None
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            old = json.load(f)
    if old and old.get("apps") == apps:
        updated = old.get("updated")
    else:
        updated = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    catalog = {"schema": 1, "name": "PicoOS App Store", "updated": updated, "apps": apps}
    text = json.dumps(catalog, indent=2, ensure_ascii=False) + "\n"
    if "--check" in sys.argv:
        if not old or old.get("apps") != apps:
            print("store/catalog.json is out of date - run tools/build_catalog.py")
            return 1
        print("catalog OK (%d apps)" % len(apps))
        return 0
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(text)
    for a in apps:
        print("  %-16s %-8s %6.1f KB  %d files" % (a["id"], a["version"], a["size"] / 1024, len(a["files"])))
    print("store/catalog.json: %d apps" % len(apps))
    return 0


if __name__ == "__main__":
    sys.exit(main())
