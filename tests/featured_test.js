#!/usr/bin/env node
/*
 * Tests the App Store's "Featured" and "Made for PicoOS" tabs in the real dashboard:
 *   1. automatic branch selection (catalog from the branch the firmware was built from),
 *   2. an old saved setting that points at a branch without a catalog (falls back),
 *   3. GitHub unreachable (uses the catalog snapshot built into PicoOS),
 * and installs one app from each tab through the UI, then opens it.
 *
 *   node tests/featured_test.js
 */
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = 18600;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`); if (!ok) failed++; };

async function waitUp() {
  for (let i = 0; i < 80; i++) { try { await fetch(BASE + "/api/status"); return; } catch { await sleep(250); } }
  throw new Error("simulator did not start");
}

async function openTab(page, tab) {
  await page.goto(BASE + "/#store");
  await page.waitForSelector("#storeModal:not([hidden])");
  await page.click(`#storeTabs [data-tab="${tab}"]`);
  await page.waitForSelector("#storeGrid .store-card, #storeMsg:not([hidden])", { timeout: 20000 });
  await sleep(500);
  return {
    cards: await page.locator("#storeGrid .store-card").count(),
    error: (await page.locator("#storeMsg:not([hidden])").count()) ? await page.locator("#storeMsg").innerText() : "",
    offline: (await page.locator("#storeFree .notice").count()) > 0,
  };
}

async function installAndOpen(ctx, page, id) {
  await page.click(`[data-install="${id}"]`);
  let app = null;
  for (let i = 0; i < 120 && !app; i++) {
    await sleep(500);
    app = (await (await fetch(BASE + "/api/apps")).json()).apps.find((a) => a.id === id);
  }
  if (!app) return "install did not finish";
  const p = await ctx.newPage();
  const errs = [];
  const origin = `http://127.0.0.1:${app.port}`;
  p.on("response", (r) => { if (r.url().startsWith(origin) && r.status() >= 400 && !/favicon|\/_picoos\/data\//.test(r.url())) errs.push(`${r.status()} ${r.url()}`); });
  p.on("pageerror", (e) => { if (!/user didn't interact/.test(e.message)) errs.push(e.message.split("\n")[0]); });
  await p.goto(origin + "/", { waitUntil: "load" });
  await sleep(1500);
  await p.close();
  await fetch(`${BASE}/api/apps/${id}`, { method: "DELETE" });
  return errs.join("; ");
}

(async () => {
  const fsDir = fs.mkdtempSync(path.join(os.tmpdir(), "picoos-featured-"));
  const sim = spawn("python3", [path.join(ROOT, "tools", "simulator.py"), "--fs", fsDir, "--port", String(PORT)], { cwd: ROOT, stdio: "ignore" });
  const browser = await chromium.launch();
  try {
    await waitUp();
    const st = await (await fetch(BASE + "/api/status")).json();
    check("build info exposed", !!(st.build && st.build.repo), JSON.stringify(st.build));

    // 1. automatic
    let ctx = await browser.newContext();
    let page = await ctx.newPage();
    let r = await openTab(page, "all");
    check("Featured loads (automatic branch)", r.cards >= 10 && !r.error && !r.offline, JSON.stringify(r));
    let err = await installAndOpen(ctx, page, "2048");
    check("install + open Featured app 2048", err === "", err);
    r = await openTab(page, "picoos");
    check("Made for PicoOS loads", r.cards >= 5 && !r.error, JSON.stringify(r));
    err = await installAndOpen(ctx, page, "notes");
    check("install + open PicoOS app notes", err === "", err);
    await ctx.close();

    // 2. old setting pointing at main (no catalog there yet)
    await fetch(BASE + "/api/settings", { method: "POST", body: JSON.stringify({ store_repo: "GokalpHizmetleri/PicoOS", store_branch: "main" }) });
    ctx = await browser.newContext();
    page = await ctx.newPage();
    r = await openTab(page, "all");
    check("Featured falls back when saved branch has no catalog", r.cards >= 10 && !r.error, JSON.stringify(r));
    await ctx.close();
    await fetch(BASE + "/api/settings", { method: "POST", body: JSON.stringify({ store_repo: "", store_branch: "" }) });

    // 3. GitHub unreachable for the catalog -> built-in snapshot
    ctx = await browser.newContext();
    await ctx.route("https://raw.githubusercontent.com/**/store/catalog.json*", (route) => route.abort());
    page = await ctx.newPage();
    r = await openTab(page, "all");
    check("Featured uses built-in catalog when GitHub is unreachable", r.cards >= 10 && r.offline, JSON.stringify(r));
    r = await openTab(page, "picoos");
    check("Made for PicoOS uses built-in catalog too", r.cards >= 5, JSON.stringify(r));
    await ctx.close();
  } finally {
    await browser.close();
    sim.kill();
    fs.rmSync(fsDir, { recursive: true, force: true });
  }
  console.log(failed ? `\n${failed} check(s) failed` : "\nALL PASSED");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
