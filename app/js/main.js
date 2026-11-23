// Teletype Model 33 for PDP-7 Unix v0: wires the modules together.
//
//   paper.js     printed lines and the print position      render.js    drawing it on the canvas
//   layout.js    fitting the paper to the window, panning  printer.js   20 chars/s print loop
//   sound.js     machine sounds                            transport.js the PDP-7 (server or worker)
//   keyboard.js  typing, also on phones                    gestures.js  wheel and touch
//   manual.js    the Unix v0 manual panel                  ui.js        buttons and menu
//   tape.js      the paper tape reader
import { STATIC_BUILD } from "./config.js";
import { paper, newPaper, scrollTo } from "./paper.js";
import { layout, resize } from "./layout.js";
import { enqueue, replaceWithHistory, startPrinting, queued, printedText, turboOn } from "./printer.js";
import { lidClosed, nextCrSample } from "./sound.js";
import { connect } from "./transport.js";
import { initKeyboard, showKeyboard, hideKeyboard, keyboardOpen } from "./keyboard.js";
import { initGestures } from "./gestures.js";
import { initManual, toggleManual, manualOpen } from "./manual.js";
import { initUI, closeMenu, menuOpen, toggleTurbo, toggleLid } from "./ui.js";
import { initTape, stopTape, tapeOpen, tapeProgress, tapeOutput } from "./tape.js";
import { $ } from "./util.js";

newPaper();

const conn = connect({
  onOutput(d) { enqueue(d); tapeOutput(d); },          // the tape reader watches for the shell prompt and ed
  onHistory(h) { replaceWithHistory(h); tapeOutput(h); },
});
const typed = (s) => { stopTape(); conn.send(s); };     // a key typed by hand stops the tape reader

// page shortcuts; everything else typed goes to the PDP-7
function shortcut(e) {
  if (e.key === "F2") { e.preventDefault(); toggleManual(); return true; }
  if (e.target.closest && e.target.closest("#man")) { if (e.key === "Escape") toggleManual(false); return true; }
  if (tapeOpen()) return true;               // the tape dialog handles its own keys
  if (e.key === "End" || e.key === "PageDown" && e.shiftKey) { e.preventDefault(); scrollTo(0); return true; }
  if (e.key === "PageUp" && e.shiftKey) { e.preventDefault(); scrollTo(paper.viewTarget + layout.h * .6); return true; }
  if (e.key === "F5") { e.preventDefault(); toggleTurbo(); return true; }
  if (e.key === "F7") { e.preventDefault(); toggleLid(); return true; }
  if (e.key === "F8") {                      // try the next carriage-return sample
    const name = nextCrSample();
    if (name) { e.preventDefault(); $("crName").textContent = name; return true; }
  }
  return false;
}
initKeyboard({ send: typed, onTyped: () => scrollTo(0), shortcut });

initGestures({ onTap: () => { closeMenu(); showKeyboard(); } });

let keyboardBeforeManual = false;
initManual({
  onLayout: resize,
  onOpen() { closeMenu(); keyboardBeforeManual = keyboardOpen(); hideKeyboard(); },   // the phone keyboard would cover it
  onClose() { if (keyboardBeforeManual) showKeyboard(); },
});

initTape({ send: conn.send, onOpen() { closeMenu(); hideKeyboard(); } });

initUI({ ...conn, send: typed });

// read-only view for tests (tests/regress.mjs) and for debugging in the console
window.__teletype = {
  get printed() { return printedText(); },
  get state() {
    return { scale: layout.scale, pan: layout.pan, panX: layout.panX, short: layout.short,
             side: document.body.classList.contains("side"), line: paper.cur, col: paper.col, turbo: turboOn(), lid: lidClosed(),
             keyboard: keyboardOpen(), manual: manualOpen(), menu: menuOpen(), tape: { open: tapeOpen(), ...tapeProgress() }, queued: queued(), staticBuild: STATIC_BUILD };
  },
};

window.addEventListener("resize", resize);
if (window.visualViewport) window.visualViewport.addEventListener("resize", resize);
resize();
void document.body.offsetHeight;             // apply the first layout without transitions...
document.body.classList.remove("preload");   // ...then allow them (see style.css)
startPrinting();

// browser-only build: work offline after the first visit (web/sw.js), keep the saved disk
if (STATIC_BUILD && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("offline mode unavailable", e));
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
