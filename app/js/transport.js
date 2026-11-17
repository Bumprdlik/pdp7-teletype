// The connection to the PDP-7: either teletype.py (Server-Sent Events + POST) or, in the static
// build, the SIMH simulator compiled to WebAssembly running in a Web Worker (pdp7-worker.js).
//
// connect() returns { send(text), restart(), wipe } - wipe (back to the original disk) is null
// when the PDP-7 runs on the server.
import { STATIC_BUILD } from "./config.js";

export function connect({ onOutput, onHistory }) {
  return STATIC_BUILD ? connectWorker(onOutput) : connectServer(onOutput, onHistory);
}

function connectServer(onOutput, onHistory) {
  const es = new EventSource("stream");
  es.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.h !== undefined) onHistory(m.h);
    if (m.d) onOutput(m.d);
  };
  let sending = Promise.resolve();      // keep the keys in order
  return {
    send: (str) => { sending = sending.then(() => fetch("key", { method: "POST", body: str }).catch(() => {})); },
    restart: () => fetch("reset", { method: "POST" }),
    wipe: null,
  };
}

function connectWorker(onOutput) {
  let worker = null, reqId = 0;
  const ask = (msg, answer) => new Promise((ok) => {      // request/answer, at most 3 s
    const id = ++reqId, t = setTimeout(ok, 3000);
    const h = (e) => { if (e.data[answer] === id) { clearTimeout(t); worker.removeEventListener("message", h); ok(); } };
    worker.addEventListener("message", h);
    worker.postMessage({ [msg]: id });
  });
  const start = () => {
    worker = new Worker("pdp7-worker.js");
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.d) onOutput(m.d);
      if (m.stopped) onOutput("\r\n\r\n[SIMULATOR STOPPED]\r\n");
      if (m.status && m.status.startsWith("error")) onOutput("\r\n[" + m.status.toUpperCase() + "]\r\n");
    };
  };
  // save (or forget) the disk, then start a fresh worker
  const powerCycle = async (how, note) => {
    await ask(how, how === "save" ? "saved" : "wiped");
    worker.terminate();
    onOutput(note);
    start();
  };
  addEventListener("pagehide", () => worker.postMessage({ save: 0 }));
  start();
  return {
    send: (str) => worker.postMessage({ keys: str }),
    restart: () => powerCycle("save", "\r\n\r\n[COMPUTER RESTART]\r\n"),
    wipe: () => powerCycle("wipe", "\r\n\r\n[NEW DISK - COMPUTER RESTART]\r\n"),
  };
}
