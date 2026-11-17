// Web Worker that runs the PDP-7 (SIMH compiled to WebAssembly) for the page (app/js/transport.js).
//
// page -> worker:  {keys: "..."}   typed characters
//                  {save: id}      save the disk now, answer {saved: id}
// worker -> page:  {d: "..."}      characters printed by the PDP-7
//                  {stopped: true} the simulator exited
//                  {status: "..."} loading progress / errors
//
// The disk lives in memory; it is saved to IndexedDB every few seconds when it
// changes, so every visitor has their own persistent PDP-7.
importScripts("pdp7.js");

const DB = "pdp7-teletype", STORE = "disk", KEY = "image.fs";
const SIMH_CFG = `set cpu 8k
set cpu eae
set throttle 1M
set tti unix
set rb ena
att rb image.fs
set lpt disa
set drm disa
set dt disa
load boot.rim 010000
go
`;

function idb() {
  return new Promise((ok, fail) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => fail(r.error);
  });
}
async function dbGet() {
  try {
    const db = await idb();
    return await new Promise((ok) => {
      const r = db.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => ok(r.result || null);
      r.onerror = () => ok(null);
    });
  } catch (e) { return null; }
}
async function dbPut(bytes) {
  const db = await idb();
  await new Promise((ok, fail) => {
    const t = db.transaction(STORE, "readwrite");
    t.objectStore(STORE).put(bytes, KEY);
    t.oncomplete = ok; t.onerror = () => fail(t.error);
  });
}
async function dbDelete() {
  const db = await idb();
  await new Promise((ok) => {
    const t = db.transaction(STORE, "readwrite");
    t.objectStore(STORE).delete(KEY);
    t.oncomplete = ok; t.onerror = ok;
  });
}

async function fetchBytes(url, gz) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ": HTTP " + r.status);
  const body = gz ? r.body.pipeThrough(new DecompressionStream("gzip")) : r.body;
  return new Uint8Array(await new Response(body).arrayBuffer());
}

let M = null, lastSaved = null, running = false;

function diskSnapshot() {
  if (!M || !running) return null;
  const p = M._web_disk_ptr(), n = M._web_disk_bytes();
  return p && n ? M.HEAPU8.slice(p, p + n) : null;
}
function sameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
async function saveDisk() {
  const snap = diskSnapshot();
  if (!snap || sameBytes(snap, lastSaved)) return;
  lastSaved = snap;
  try { await dbPut(snap); } catch (e) { console.warn("saving the disk failed", e); }
}

const pending = [];      // keys typed before the simulator is ready
onmessage = async (e) => {
  const m = e.data;
  if (m.keys !== undefined) {
    for (const ch of m.keys) {
      const c = ch.charCodeAt(0) & 0x7f;
      if (c === 5) continue;              // Ctrl+E would stop SIMH and ask for a command
      (M ? M.keyQueue : pending).push(c);
    }
  } else if (m.save !== undefined) {
    await saveDisk();
    postMessage({ saved: m.save });
  } else if (m.wipe !== undefined) {      // forget the saved disk (next start = factory disk)
    running = false;
    await dbDelete();
    postMessage({ wiped: m.wipe });
  }
};

(async () => {
  try {
    postMessage({ status: "loading disk" });
    let disk = await dbGet();
    if (disk) disk = new Uint8Array(disk);
    else disk = await fetchBytes("image.fs.gz", true);
    const boot = await fetchBytes("boot.rim", false);
    lastSaved = disk;

    const mod = {
      keyQueue: pending,
      outBuf: [],
      flushOutput() {
        if (!this.outBuf.length) return;
        postMessage({ d: String.fromCharCode(...this.outBuf.map((c) => c & 0x7f)) });
        this.outBuf.length = 0;
      },
      print: (t) => console.log("[simh]", t),
      printErr: (t) => console.warn("[simh]", t),
      stdin: () => null,                  // SIMH asking for a command = EOF = quit
      onExit: () => { running = false; mod.flushOutput(); postMessage({ stopped: true }); },
      locateFile: (p) => p,
    };
    M = await createPDP7(mod);
    M.FS.writeFile("/image.fs", disk);
    M.FS.writeFile("/boot.rim", boot);
    M.FS.writeFile("/teletype.simh", SIMH_CFG);
    running = true;
    postMessage({ status: "running" });
    setInterval(saveDisk, 5000);
    M.callMain(["/teletype.simh"]);
  } catch (err) {
    postMessage({ status: "error: " + err.message });
  }
})();
