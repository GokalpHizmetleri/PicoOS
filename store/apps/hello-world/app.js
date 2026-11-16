// Hello World - a minimal PicoOS app.
// The PicoOS SDK lives at relative URLs starting with "_picoos/":
//   GET  _picoos/info          -> app + device info
//   GET  _picoos/system        -> memory, storage, temperature, uptime, time
//   GET  _picoos/data/<key>    -> read a value stored on the Pico
//   PUT  _picoos/data/<key>    -> store any JSON (max 32 KB per key)
const $ = (s) => document.querySelector(s);

async function showInfo() {
  const [info, sys] = await Promise.all([
    fetch("_picoos/info").then((r) => r.json()),
    fetch("_picoos/system").then((r) => r.json()),
  ]);
  const t = sys.time;
  const local = new Date((t.unix + t.offset) * 1000).toISOString().slice(11, 19);
  $("#info").innerHTML = `
    <dt>Device</dt><dd>${info.device_name} (${info.hostname}.local)</dd>
    <dt>Board</dt><dd>${sys.board}</dd>
    <dt>Local time</dt><dd>${local} · ${t.tz}</dd>
    <dt>Free storage</dt><dd>${(sys.storage.free / 1024).toFixed(0)} KB</dd>`;
}

async function getVisits() {
  const r = await fetch("_picoos/data/visits");
  return r.ok ? r.json() : 0;
}

$("#visit").onclick = async () => {
  const n = (await getVisits()) + 1;
  await fetch("_picoos/data/visits", { method: "PUT", body: JSON.stringify(n) });
  $("#visits").textContent = `This app has been visited ${n} time${n === 1 ? "" : "s"}.`;
};

showInfo().catch(() => ($("#info").innerHTML = "<dt>Not running on PicoOS?</dt>"));
getVisits().then((n) => n && ($("#visits").textContent = `Visited ${n} times so far.`));
