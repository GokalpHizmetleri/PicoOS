#!/usr/bin/env python3
"""Build the PicoOS App Store catalog (store/catalog.json).

The catalog has two kinds of apps:

* **PicoOS apps** in store/apps/<id>/ (made for PicoOS, use the SDK).
* **GitHub apps**: real open-source web projects that live in *their own*
  GitHub repositories, listed in store/sources.json. For each one this script
  resolves the latest commit of the branch, lists the files at that commit,
  keeps only what a browser needs, checks that it fits on a Pico 2 W and pins
  the app to that exact commit. The dashboard then downloads the files straight
  from raw.githubusercontent.com/<owner>/<repo>/<commit>/...

It can also *discover* more projects with GitHub searches (see "discover" in
sources.json) and include the ones that pass the same checks.

CI runs this every day and on every push, so the store follows upstream
changes: a new upstream commit becomes an "Update" button in every dashboard.

    python3 tools/update_store.py                 # rebuild store/catalog.json
    python3 tools/update_store.py --offline       # keep GitHub apps as they are, refresh local ones
    python3 tools/update_store.py --check         # fail if local apps changed but catalog didn't
    python3 tools/update_store.py --inspect owner/repo[@branch][:root]

Set GITHUB_TOKEN to raise GitHub API rate limits (CI does this).
"""
import datetime
import fnmatch
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = os.path.join(ROOT, "store")
APPS = os.path.join(STORE, "apps")
SOURCES = os.path.join(STORE, "sources.json")
OUT = os.path.join(STORE, "catalog.json")

MAX_PICOOS_APP = 1024 * 1024
MAX_GITHUB_APP = 900 * 1024      # leave room for several apps on ~2.2 MB
MAX_FILES = 60
REQUIRED = ("id", "name", "version", "description")
PERMISSIVE = {"MIT", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Apache-2.0", "Unlicense", "0BSD",
              "CC0-1.0", "WTFPL", "MPL-2.0", "GPL-2.0", "GPL-3.0", "LGPL-3.0", "AGPL-3.0", "Zlib"}

WEB_EXT = {"html", "htm", "css", "js", "mjs", "json", "svg", "png", "jpg", "jpeg", "gif", "webp",
           "ico", "woff", "woff2", "ttf", "otf", "txt", "wasm", "mp3", "wav", "ogg", "webmanifest",
           "csv", "xml", "glsl", "frag", "vert"}
DEFAULT_EXCLUDE = [
    ".*", "*/.*", "node_modules/*", "*/node_modules/*", "test/*", "tests/*", "spec/*", "docs/*",
    "*.md", "*.map", "*.scss", "*.sass", "*.less", "*.ts", "*.eot", "*.psd", "package.json",
    "package-lock.json", "bower.json", "composer.json", "*.config.js", "gulpfile.js", "Gruntfile.js",
    "webpack.*", "rollup.*", "*.min.js.gz", "LICENSE*", "license*",
]

UA = {"User-Agent": "PicoOS-store-updater"}


# ------------------------------------------------------------------ helpers
def http_json(url, token=False):
    headers = dict(UA)
    headers["Accept"] = "application/vnd.github+json" if "api.github.com" in url else "application/json"
    if token and os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = "Bearer " + os.environ["GITHUB_TOKEN"]
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (403, 429, 502, 503) and attempt < 3:
                time.sleep(5 * (attempt + 1))
                continue
            raise
        except urllib.error.URLError:
            if attempt < 3:
                time.sleep(3)
                continue
            raise


def http_text(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def head_commit(repo, branch):
    out = subprocess.run(["git", "ls-remote", "https://github.com/%s.git" % repo, "refs/heads/" + branch],
                         capture_output=True, text=True, timeout=60)
    line = out.stdout.strip().split("\n")[0]
    if not line:
        raise RuntimeError("branch %s not found in %s" % (branch, repo))
    return line.split()[0]


def repo_meta(repos):
    """Stars, license, description... for many repos with as few API calls as possible."""
    meta = {}
    repos = list(repos)
    for i in range(0, len(repos), 6):
        chunk = repos[i:i + 6]
        q = " ".join("repo:" + r for r in chunk)
        url = "https://api.github.com/search/repositories?per_page=100&q=" + urllib.parse.quote(q)
        try:
            data = http_json(url, token=True)
        except Exception as e:  # noqa: BLE001
            print("  ! metadata lookup failed for %s: %s" % (chunk, e))
            continue
        for it in data.get("items", []):
            meta[it["full_name"].lower()] = it
        time.sleep(2.5)
    return meta


def list_files(repo, sha, root="", exclude=()):
    d = http_json("https://data.jsdelivr.com/v1/packages/gh/%s@%s?structure=flat" % (repo, sha))
    prefix = (root.strip("/") + "/") if root.strip("/") else ""
    patterns = list(DEFAULT_EXCLUDE) + list(exclude)
    out = []
    for f in d.get("files", []):
        name = f["name"].lstrip("/")
        if not name.startswith(prefix):
            continue
        rel = name[len(prefix):]
        ext = rel.rsplit(".", 1)[-1].lower() if "." in rel else ""
        if ext not in WEB_EXT:
            continue
        if any(fnmatch.fnmatch(rel, p) or fnmatch.fnmatch(rel.split("/")[-1], p) for p in patterns):
            continue
        out.append({"path": rel, "size": f["size"]})
    out.sort(key=lambda f: f["path"])
    return out


EXTERNAL = re.compile(
    r"""<script[^>]+src\s*=\s*["'](?:https?:)?//"""          # remote scripts
    r"""|<link[^>]+rel\s*=\s*["']?stylesheet[^>]*href\s*=\s*["'](?:https?:)?//"""
    r"""|<link[^>]+href\s*=\s*["'](?:https?:)?//[^"']+\.css"""
    r"""|<img[^>]+src\s*=\s*["'](?:https?:)?//"""            # remote images
    r"""|@import\s+(?:url\()?["']?https?://""", re.I)
REMOTE_CALL = re.compile(r"""fetch\(\s*[`'"]https?://|\.open\(\s*["'](?:GET|POST)["']\s*,\s*[`'"]https?://""", re.I)
# Optional extras that don't stop an app from working offline: analytics and web fonts.
ANALYTICS = re.compile(
    r"<script[^>]*(?:google-analytics\.com|googletagmanager\.com)[^>]*>"
    r"|<link[^>]*fonts\.(?:googleapis|gstatic)\.com[^>]*>"
    r"|@import\s+(?:url\()?[\"']?https?://fonts\.googleapis\.com[^;]*;?", re.I)


LOCAL_REF = re.compile(r"""(?:src|href)\s*=\s*["']([^"'#?]+)""", re.I)


def missing_refs(raw_base, files, entry):
    """Local files the start page links to that the app doesn't contain."""
    try:
        html = http_text(raw_base + urllib.parse.quote(_src_of(files, entry)))
    except Exception:  # noqa: BLE001
        return []
    have = {f["path"] for f in files}
    folder = entry.rsplit("/", 1)[0] + "/" if "/" in entry else ""
    out = []
    for ref in LOCAL_REF.findall(html):
        if re.match(r"^(?:[a-z]+:|//)", ref, re.I) or not ref.strip():
            continue
        parts = []
        for seg in (ref.lstrip("/") if ref.startswith("/") else folder + ref).split("/"):
            if seg == "..":
                parts = parts[:-1]
            elif seg not in ("", "."):
                parts.append(seg)
        p = urllib.parse.unquote("/".join(parts))
        if p and p not in have and p.rstrip("/") + "/index.html" not in have:
            out.append(ref)
    return sorted(set(out))


def _src_of(files, path):
    for f in files:
        if f["path"] == path:
            return f.get("src", path)
    return path


def needs_internet(raw_base, files, entry):
    """Heuristic: does the app load scripts/styles from the internet or call web APIs?"""
    texts = []
    for f in files:
        if f["path"] == entry or (f["path"].endswith((".js", ".html", ".css")) and f["size"] < 60000):
            try:
                texts.append(http_text(raw_base + urllib.parse.quote(f.get("src", f["path"]))))
            except Exception:  # noqa: BLE001
                pass
    blob = ANALYTICS.sub("", "\n".join(texts))
    return bool(EXTERNAL.search(blob) or REMOTE_CALL.search(blob))


# --------------------------------------------------------------- local apps
def collect_local(app_dir):
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


def local_apps():
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
        files = collect_local(d)
        entry = man.get("entry", "index.html")
        if not any(f["path"] == entry for f in files):
            raise SystemExit("%s: entry file %s not found" % (app_id, entry))
        size = sum(f["size"] for f in files)
        if size > MAX_PICOOS_APP:
            raise SystemExit("%s: %d bytes is too large (max %d)" % (app_id, size, MAX_PICOOS_APP))
        app = dict(man)
        app.setdefault("entry", "index.html")
        app.update({"source": "picoos", "path": "store/apps/" + app_id, "size": size, "files": files})
        apps.append(app)
    return apps


# -------------------------------------------------------------- GitHub apps
def build_github_app(src, meta, previous):
    repo = src["repo"]
    branch = src.get("branch") or (meta or {}).get("default_branch") or "main"
    root = src.get("root", "").strip("/")
    entry = src.get("entry", "index.html")
    sha = head_commit(repo, branch)
    spec = json.dumps({k: src.get(k) for k in ("root", "entry", "exclude", "include", "internet", "rename")}, sort_keys=True)
    prev = previous.get(src["id"])
    if prev and prev.get("ref") == sha and prev.get("spec") == spec:
        app = dict(prev)        # unchanged upstream: keep, just refresh stars
    else:
        files = list_files(repo, sha, root, src.get("exclude", ()))
        if src.get("include"):
            files = [f for f in files if any(fnmatch.fnmatch(f["path"], p) for p in src["include"])]
        for old_name, new_name in (src.get("rename") or {}).items():
            for f in files:
                if f["path"] == old_name:
                    f["src"], f["path"] = old_name, new_name
        if not any(f["path"] == entry for f in files):
            raise RuntimeError("entry %s not found at %s" % (entry, sha[:7]))
        size = sum(f["size"] for f in files)
        if size > MAX_GITHUB_APP:
            raise RuntimeError("too large: %d KB" % (size // 1024))
        if len(files) > MAX_FILES:
            raise RuntimeError("too many files: %d" % len(files))
        base = "https://raw.githubusercontent.com/%s/%s/%s" % (repo, sha, (root + "/") if root else "")
        for miss in missing_refs(base, files, entry):
            print("  ! %s: %s references %s, which is not part of the app" % (src["id"], entry, miss))
        app = {
            "id": src["id"],
            "entry": entry,
            "ref": sha,
            "version": sha[:7],
            "root": root,
            "base": base,
            "files": files,
            "size": size,
            "internet": src.get("internet", needs_internet(base, files, entry)),
            "spec": spec,
        }
    m = meta or {}
    lic = ((m.get("license") or {}).get("spdx_id")) or src.get("license") or (prev or {}).get("license") or ""
    app.update({
        "name": src.get("name") or m.get("name") or repo.split("/")[1],
        "description": src.get("description") or m.get("description") or (prev or {}).get("description", ""),
        "author": src.get("author") or repo.split("/")[0],
        "category": src.get("category", "Web apps"),
        "icon": src.get("icon", ""),
        "color": src.get("color", ""),
        "spa": bool(src.get("spa", False)),
        "source": "github",
        "repo": repo,
        "branch": branch,
        "homepage": "https://github.com/%s" % repo + (("/tree/%s/%s" % (branch, root)) if root else ""),
        "license": lic,
        "stars": m.get("stargazers_count", (prev or {}).get("stars", 0)),
        "pushed_at": m.get("pushed_at", (prev or {}).get("pushed_at", "")),
    })
    if lic and lic not in PERMISSIVE and lic != "NOASSERTION":
        raise RuntimeError("license %s is not in the allowed list" % lic)
    return app


def needs_build(repo, branch):
    """Projects with a bundler/build script don't run as plain files."""
    try:
        pkg = json.loads(http_text("https://raw.githubusercontent.com/%s/%s/package.json" % (repo, branch)))
    except Exception:  # noqa: BLE001 - no package.json: plain static site
        return False
    scripts = " ".join((pkg.get("scripts") or {}).keys()) + " " + " ".join((pkg.get("devDependencies") or {}).keys())
    return bool(re.search(r"\bbuild\b|vite|webpack|parcel|rollup|esbuild|typescript|react-scripts|next|svelte", scripts))


def discover(cfg, known_ids, known_repos):
    """Find more apps with GitHub searches; include those passing all checks."""
    found = []
    for q in cfg.get("queries", []):
        url = "https://api.github.com/search/repositories?sort=stars&order=desc&per_page=%d&q=%s" % (
            cfg.get("per_query", 20), urllib.parse.quote(q))
        try:
            items = http_json(url, token=True).get("items", [])
        except Exception as e:  # noqa: BLE001
            print("  ! search failed (%s): %s" % (q, e))
            continue
        for it in items:
            repo = it["full_name"]
            lic = (it.get("license") or {}).get("spdx_id") or ""
            if repo.lower() in known_repos or lic not in PERMISSIVE or it.get("archived") or it.get("fork"):
                continue
            app_id = re.sub(r"[^a-z0-9-]+", "-", it["name"].lower()).strip("-")[:32] or "app"
            if app_id in known_ids:
                app_id = (app_id + "-" + it["owner"]["login"].lower())[:32]
            src = {"id": app_id, "repo": repo, "branch": it["default_branch"], "category": cfg.get("category", "Discovered")}
            try:
                if needs_build(repo, it["default_branch"]):
                    raise RuntimeError("needs a build step (package.json scripts)")
                app = build_github_app(src, it, {})
            except Exception as e:  # noqa: BLE001
                print("  - skip %s: %s" % (repo, e))
                continue
            app["discovered"] = True
            found.append(app)
            known_ids.add(app_id)
            known_repos.add(repo.lower())
            print("  + discovered %s (%d KB)" % (repo, app["size"] // 1024))
            if len(found) >= cfg.get("max", 20):
                return found
        time.sleep(3)
    return found


# --------------------------------------------------------------------- main
def load_previous():
    if not os.path.exists(OUT):
        return {}
    with open(OUT, encoding="utf-8") as f:
        old = json.load(f)
    return old


def strip_private(apps):
    return [{k: v for k, v in a.items() if not k.startswith("_")} for a in apps]


def main(argv):
    if "--inspect" in argv:
        spec = argv[argv.index("--inspect") + 1]
        root = ""
        if ":" in spec:
            spec, root = spec.split(":", 1)
        repo, _, branch = spec.partition("@")
        branch = branch or "master"
        sha = head_commit(repo, branch)
        files = list_files(repo, sha, root)
        for f in files:
            print("  %7d  %s" % (f["size"], f["path"]))
        base = "https://raw.githubusercontent.com/%s/%s/%s" % (repo, sha, (root.strip("/") + "/") if root else "")
        print("%s@%s (%s) root=%r: %d files, %.1f KB, internet=%s" % (
            repo, branch, sha[:7], root, len(files), sum(f["size"] for f in files) / 1024, needs_internet(base, files, "index.html")))
        return 0

    old = load_previous()
    old_apps = {a["id"]: a for a in old.get("apps", [])}
    with open(SOURCES, encoding="utf-8") as f:
        sources = json.load(f)
    apps = local_apps()
    ids = {a["id"] for a in apps}

    if "--check" in argv:
        old_local = [a for a in old.get("apps", []) if a.get("source") == "picoos"]
        if old_local != apps:
            print("store/catalog.json is out of date - run tools/update_store.py")
            return 1
        print("catalog OK (%d PicoOS apps, %d GitHub apps)" % (len(apps), len(old.get("apps", [])) - len(apps)))
        return 0

    if "--offline" in argv:
        gh_apps = [a for a in old.get("apps", []) if a.get("source") == "github"]
    else:
        srcs = sources.get("github", [])
        meta = repo_meta({s["repo"] for s in srcs})
        gh_apps = []
        for src in srcs:
            if src["id"] in ids:
                raise SystemExit("duplicate app id %s" % src["id"])
            try:
                app = build_github_app(src, meta.get(src["repo"].lower()), old_apps)
            except Exception as e:  # noqa: BLE001
                print("  ! %s (%s): %s" % (src["id"], src["repo"], e))
                if src["id"] in old_apps and old_apps[src["id"]].get("source") == "github":
                    gh_apps.append(old_apps[src["id"]])   # keep last good version
                continue
            ids.add(app["id"])
            gh_apps.append(app)
            print("  %-22s %-36s %7.1f KB  %2d files  %s%s" % (
                app["id"], app["repo"] + (":" + app["root"] if app["root"] else ""), app["size"] / 1024,
                len(app["files"]), app["version"], "  (internet)" if app["internet"] else ""))
        if sources.get("discover"):
            gh_apps += discover(sources["discover"], ids, {s["repo"].lower() for s in srcs})

    all_apps = strip_private(apps + gh_apps)
    if old.get("apps") == all_apps:
        updated = old.get("updated")
    else:
        updated = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    catalog = {"schema": 2, "name": "PicoOS App Store", "updated": updated, "apps": all_apps}
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n")
    print("store/catalog.json: %d PicoOS apps + %d GitHub apps" % (len(apps), len(gh_apps)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
