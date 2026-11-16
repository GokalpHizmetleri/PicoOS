#!/usr/bin/env node
/*
 * End-to-end test of "Explore GitHub" against the real GitHub:
 *   - opens the dashboard (simulator) and the App Store's Explore tab,
 *   - lets the browser search GitHub and check the results (several categories + a search),
 *   - clicks Install on a sample of the apps it marked as runnable,
 *   - opens every installed app and fails on files that don't load from the Pico or JS errors.
 *
 *   node tests/explore_test.js [--per-category N] [--categories games,projects] [--search "snake game"]
 *
 * Needs internet access and Playwright. Set GITHUB_TOKEN to avoid search rate limits.
 */
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = 18500;
const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (name, def) => { const i = process.argv.indexOf("--" + name); return i > 0 ? process.argv[i + 1] : def; };
const PER = +arg("per-category", 3);
const CATS = arg("categories", "popular,games,projects,vanilla").split(",");
const SEARCH = arg("search", "snake game");

async function waitUp() {
  for (let i = 0; i < 80; i++) { try { await fetch(BASE + "/api/status"); return; } catch { await sleep(250); } }
  throw new Error("simulator did not start");
}

async function waitChecks(page, timeout = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const st = await page.evaluate(() => {
      const E = window.PicoOSExplore._state;
      return { loading: E.loading, items: E.items.length, done: E.items.filter((i) => E.results.has(i.full_name)).length, error: E.error };
    });
    if (st.error) return st;
    if (!st.loading && st.items && st.done === st.items.length) { await sleep(1500); return st; }
    await sleep(1000);
  }
  return { timeout: true };
}

(async () => {
  const fsDir = fs.mkdtempSync(path.join(os.tmpdir(), "picoos-explore-"));
  const sim = spawn("python3", [path.join(ROOT, "tools", "simulator.py"), "--fs", fsDir, "--port", String(PORT)], { cwd: ROOT, stdio: "ignore" });
  const browser = await chromium.launch();
  const report = { categories: {}, installs: [] };
  let failed = 0;
  try {
    await waitUp();
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    if (process.env.GITHUB_TOKEN) await ctx.addInitScript((t) => localStorage.setItem("picoos.ghToken", JSON.stringify(t)), process.env.GITHUB_TOKEN);
    const page = await ctx.newPage();
    await page.goto(BASE + "/#store");
    await page.waitForSelector("#storeModal:not([hidden])");

    const runs = CATS.map((c) => ({ kind: "preset", value: c }));
    if (SEARCH) runs.push({ kind: "search", value: SEARCH });
    const toInstall = [];
    for (const run of runs) {
      if (run.kind === "preset") await page.click(`#storeCats [data-preset="${run.value}"]`);
      else { await page.fill("#storeSearch", run.value); await page.press("#storeSearch", "Enter"); }
      await sleep(1500);
      const st = await waitChecks(page);
      const summary = await page.evaluate(() => {
        const E = window.PicoOSExplore._state;
        const res = E.items.map((i) => ({ repo: i.full_name, stars: i.stars, ...(E.results.get(i.full_name) || {}) }));
        const reasons = {};
        res.filter((r) => !r.ok).forEach((r) => { const k = (r.reason || "?").replace(/\(.*\)/, "").replace(/:.*/, "").trim(); reasons[k] = (reasons[k] || 0) + 1; });
        return { checked: res.length, ok: res.filter((r) => r.ok).map((r) => ({ repo: r.repo, size: r.size, files: r.files.length, root: r.root, branch: r.branch })), reasons };
      });
      const label = `${run.kind}:${run.value}`;
      report.categories[label] = { ...summary, error: st.error };
      console.log(`\n${label}: ${summary.ok.length} runnable of ${summary.checked} checked${st.error ? "  ERROR: " + st.error : ""}`);
      console.log("   rejected:", JSON.stringify(summary.reasons));
      summary.ok.slice(0, 8).forEach((o) => console.log(`   ok  ${o.repo}  ${(o.size / 1024).toFixed(0)} KB, ${o.files} files${o.root ? ", root " + o.root : ""}${o.branch !== "main" && o.branch !== "master" ? ", branch " + o.branch : ""}`));
      summary.ok.slice(0, PER).forEach((o) => toInstall.push({ label, repo: o.repo }));
    }

    // install through the UI, one at a time, then test the app
    const seen = new Set();
    for (const { label, repo } of toInstall) {
      if (seen.has(repo)) continue;
      seen.add(repo);
      const res = { repo, ok: true, notes: [] };
      report.installs.push(res);
      // make the repo visible in the grid again (it belongs to `label`)
      const [kind, value] = label.split(/:(.*)/s);
      if (kind === "preset") await page.click(`#storeCats [data-preset="${value}"]`);
      else { await page.fill("#storeSearch", value); await page.press("#storeSearch", "Enter"); }
      await waitChecks(page);
      const btn = page.locator(`[data-exinstall="${repo}"]`);
      if (!(await btn.count())) { res.ok = false; res.notes.push("install button not shown (no space?)"); failed++; continue; }
      await btn.first().click();
      let app = null;
      for (let i = 0; i < 240 && !app; i++) {
        await sleep(500);
        const apps = (await (await fetch(BASE + "/api/apps")).json()).apps;
        app = apps.find((a) => a.repo === repo);
      }
      if (!app) { res.ok = false; res.notes.push("install did not finish"); failed++; continue; }
      const p = await ctx.newPage();
      const origin = `http://127.0.0.1:${app.port}`;
      p.on("response", (r) => { if (r.url().startsWith(origin) && r.status() >= 400 && !/favicon\.ico$/.test(r.url())) { res.ok = false; res.notes.push(`${r.status()} ${r.url().slice(origin.length)}`); } });
      p.on("pageerror", (e) => {
        const m = e.message.split("\n")[0];
        if (/user didn't interact|AudioContext/.test(m)) return;
        res.ok = false; res.notes.push("JS error: " + m);
      });
      try {
        await p.goto(origin + "/", { waitUntil: "load", timeout: 30000 });
        await sleep(2000);
        const empty = await p.evaluate(() => !(document.body.innerText.trim() || document.querySelector("canvas,svg,img,iframe")));
        if (empty) { res.ok = false; res.notes.push("page is empty"); }
      } catch (e) { res.ok = false; res.notes.push("load: " + e.message.split("\n")[0]); }
      await p.close();
      if (!res.ok) failed++;
      console.log(`${res.ok ? "PASS" : "FAIL"}  install+open ${repo}  (${(app.size / 1024).toFixed(0)} KB on flash)${res.notes.length ? "\n        " + [...new Set(res.notes)].slice(0, 5).join("\n        ") : ""}`);
      await fetch(`${BASE}/api/apps/${app.id}`, { method: "DELETE" });
      await page.evaluate(() => window.PicoOSDash.refresh());
    }
  } finally {
    await browser.close();
    sim.kill();
    fs.rmSync(fsDir, { recursive: true, force: true });
  }
  const n = report.installs.length;
  console.log(`\n${n - failed}/${n} installed apps work on PicoOS.`);
  fs.writeFileSync(path.join(os.tmpdir(), "picoos-explore-report.json"), JSON.stringify(report, null, 2));
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
