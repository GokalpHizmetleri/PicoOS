#!/usr/bin/env node
/*
 * Installs every app from store/catalog.json into the PicoOS simulator, exactly
 * the way the dashboard does (download from GitHub / the store folder, upload to
 * PicoOS), then opens each app in headless Chromium and reports files that fail
 * to load from the Pico and JavaScript errors.
 *
 *   node tests/store_apps_test.js [app-id ...]
 *   MICROPYTHON=/path/to/micropython node tests/store_apps_test.js   # on the MicroPython unix port
 *   node tests/store_apps_test.js --prune-discovered   # drop failing auto-discovered apps from the catalog
 *
 * Needs internet access (raw.githubusercontent.com) and Playwright.
 */
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = 18400;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUp() {
  for (let i = 0; i < 80; i++) {
    try { await fetch(BASE + "/api/status"); return; } catch { await sleep(250); }
  }
  throw new Error("simulator did not start");
}

async function getFile(app, rel) {
  if (app.source === "github") {
    const f = app.files.find((x) => x.path === rel);
    const url = app.base + (f.src || rel).split("/").map(encodeURIComponent).join("/");
    const r = await fetch(url);
    if (!r.ok) throw new Error(`download ${url}: ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  return fs.readFileSync(path.join(ROOT, app.path, rel));
}

async function install(app) {
  const meta = { ...app, size: app.size, files: app.files.length };
  let r = await fetch(BASE + "/api/apps/install/begin", { method: "POST", body: JSON.stringify(meta) });
  if (!r.ok) throw new Error("begin: " + (await r.text()));
  for (const f of app.files) {
    const body = await getFile(app, f.path);
    if (body.length !== f.size) throw new Error(`${f.path}: size ${body.length} != catalog ${f.size}`);
    r = await fetch(`${BASE}/api/apps/install/file?id=${app.id}&path=${encodeURIComponent(f.path)}`, { method: "PUT", body });
    if (!r.ok) throw new Error(`upload ${f.path}: ` + (await r.text()));
  }
  r = await fetch(BASE + "/api/apps/install/commit", { method: "POST", body: JSON.stringify({ id: app.id }) });
  if (!r.ok) throw new Error("commit: " + (await r.text()));
  return (await r.json()).app;
}

(async () => {
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, "store", "catalog.json"), "utf8"));
  const prune = process.argv.includes("--prune-discovered");
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const apps = cat.apps.filter((a) => (only.length ? only.includes(a.id) : a.source === "github"));
  const fsDir = fs.mkdtempSync(path.join(os.tmpdir(), "picoos-store-"));
  const cmd = process.env.MICROPYTHON
    ? [process.env.MICROPYTHON, [path.join(ROOT, "tests", "run_micropython.py"), fsDir, String(PORT)]]
    : ["python3", [path.join(ROOT, "tools", "simulator.py"), "--fs", fsDir, "--port", String(PORT)]];
  const sim = spawn(cmd[0], cmd[1], { cwd: ROOT, stdio: "ignore" });
  const shots = path.join(os.tmpdir(), "picoos-store-shots");
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  try {
    await waitUp();
    for (const app of apps) {
      const res = { id: app.id, ok: true, notes: [], discovered: !!app.discovered };
      results.push(res);
      let installed;
      try {
        installed = await install(app);
      } catch (e) {
        res.ok = false; res.notes.push("INSTALL FAILED: " + e.message);
        continue;
      }
      const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
      const origin = `http://127.0.0.1:${installed.port}`;
      page.on("response", (r) => {
        if (r.url().startsWith(origin) && r.status() >= 400) { res.ok = false; res.notes.push(`404 from Pico: ${r.url().slice(origin.length)}`); }
      });
      page.on("pageerror", (e) => {
        const msg = e.message.split("\n")[0];
        if (/play\(\) failed because the user didn't interact/.test(msg)) { res.notes.push("(audio waits for a click - browser autoplay policy)"); return; }
        res.ok = false; res.notes.push("JS error: " + msg);
      });
      page.on("requestfailed", (r) => { if (!r.url().startsWith(origin)) res.notes.push("external (offline here?): " + new URL(r.url()).host); });
      try {
        await page.goto(origin + "/", { waitUntil: "load", timeout: 20000 });
        await sleep(1500);
        await page.screenshot({ path: path.join(shots, app.id + ".png") });
        const text = (await page.evaluate(() => document.body.innerText || "")).trim();
        const canvas = await page.evaluate(() => document.querySelectorAll("canvas").length);
        if (!text && !canvas) { res.ok = false; res.notes.push("page is empty"); }
      } catch (e) {
        res.ok = false; res.notes.push("load failed: " + e.message.split("\n")[0]);
      }
      await page.close();
      // keep flash free for the next app
      await fetch(`${BASE}/api/apps/${app.id}`, { method: "DELETE" });
    }
  } finally {
    await browser.close();
    sim.kill();
    fs.rmSync(fsDir, { recursive: true, force: true });
  }
  if (prune) {
    const bad = new Set(results.filter((r) => !r.ok && r.discovered).map((r) => r.id));
    if (bad.size) {
      cat.apps = cat.apps.filter((a) => !bad.has(a.id));
      fs.writeFileSync(path.join(ROOT, "store", "catalog.json"), JSON.stringify(cat, null, 2) + "\n");
      console.log(`Removed ${bad.size} failing discovered app(s) from the catalog: ${[...bad].join(", ")}`);
    }
  }
  let failed = 0;
  for (const r of results) {
    if (!r.ok && !(prune && r.discovered)) failed++;
    const uniq = [...new Set(r.notes)];
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.id}${uniq.length ? "\n        " + uniq.join("\n        ") : ""}`);
  }
  console.log(`\n${results.length - failed}/${results.length} apps work on PicoOS. Screenshots: ${shots}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
