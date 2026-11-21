// The paper tape reader of the Model 33 ASR: a program is pasted or loaded from a file, and the
// reader "types" it to the PDP-7 at 10 characters per second (Turbo: faster), exactly as if it
// were typed on the keyboard - v0 echoes it, so it is printed on the paper too.
//
// The text goes through the same conversion as typed keys: lower case, Return for a line end.
// Characters a Model 33 cannot send (accents, emoji, control characters) are left out, and the
// braces become B's $( and $): the Model 33 has no { }, and v0 takes } (0175) for ALT MODE, which
// would interrupt the program reading the tape (sys/s7.s). Typing on the keyboard stops the tape.
import { turboOn } from "./printer.js";
import { $ } from "./util.js";

// A real reader does 10 characters per second. Turbo can't go much faster: v0 echoes every character,
// and its console only prints about 80 per second in the browser build (1M instructions/s); input
// faster than the echo overflows v0's buffers and characters are lost (60 still works, 120 does not).
const CPS = 10, TURBO_CPS = 40;
const dlg = $("tape"), text = $("tapeText"), file = $("tapeFile"), info = $("tapeInfo"), status = $("tapeStatus");
let send = null, onOpen = () => {};
let tape = "", pos = 0, timer = 0, budget = 0, last = 0;

// what the reader would send for this text; skipped = characters left out, braces = { } replaced,
// erasers = # and @ (they erase a character / the line, as when typed)
export function tapeChars(s) {
  let out = "", skipped = 0, braces = 0, erasers = 0;
  for (const ch of s.replace(/\r\n?/g, "\n")) {
    const c = ch.codePointAt(0);
    if (ch === "\n") out += "\r";
    else if (ch === "{" || ch === "}") { out += ch === "{" ? "$(" : "$)"; braces++; }
    else if (ch === "\t" || (c >= 32 && c < 127)) { out += ch.toLowerCase(); if (ch === "#" || ch === "@") erasers++; }
    else skipped++;
  }
  return { chars: out, skipped, braces, erasers };
}

export const tapeOpen = () => !dlg.hidden;
export const tapeReading = () => !!timer;
export const tapeProgress = () => ({ reading: !!timer, pos, len: tape.length });

export function openTape() { onOpen(); dlg.hidden = false; describe(); text.focus(); }
export function closeTape() { dlg.hidden = true; text.blur(); }

function describe() {
  const { chars, skipped, braces, erasers } = tapeChars(text.value);
  const lines = chars ? chars.split("\r").length - (chars.endsWith("\r") ? 1 : 0) : 0;
  const secs = Math.ceil(chars.length / (turboOn() ? TURBO_CPS : CPS));
  const n = (k, what) => `${k} ${what}${k === 1 ? "" : "s"}`;
  info.textContent = !chars ? "" : [
    `${n(chars.length, "character")}, ${n(lines, "line")}, about ${secs < 90 ? secs + " s" : Math.round(secs / 60) + " min"}`,
    braces && `${n(braces, "brace")} { } will be read as $( $)`,
    erasers && `contains # or @, which erase as when typed`,
    skipped && `${n(skipped, "character")} a Model 33 cannot send will be left out`,
  ].filter(Boolean).join(" · ");
  $("tapeRead").disabled = !chars;
}

function showStatus() {
  status.hidden = !timer;
  if (timer) status.textContent = `Reading tape ${Math.round(100 * pos / tape.length)} % · tap to stop`;
}

function tick() {
  const now = performance.now();
  budget += (now - last) / 1000 * (turboOn() ? TURBO_CPS : CPS); last = now;
  // a background tab only ticks once a second: catch up, but never in one big burst
  budget = Math.min(budget, 8);
  let n = Math.floor(budget);
  if (n > 0) { budget -= n; send(tape.slice(pos, pos + n)); pos += n; }
  if (pos >= tape.length) stopTape(); else showStatus();
}

export function readTape(s) {
  stopTape();
  tape = tapeChars(s).chars; pos = 0;
  if (!tape) return;
  budget = 1; last = performance.now();
  timer = setInterval(tick, 50);
  tick();
}

export function stopTape() {
  if (timer) clearInterval(timer);
  timer = 0; showStatus();
}

// send(text): to the PDP-7; onOpen(): the dialog is about to open (close the menu, the keyboard...)
export function initTape(opts) {
  send = opts.send; onOpen = opts.onOpen || onOpen;
  text.addEventListener("input", describe);
  $("tapeChoose").onclick = () => file.click();
  file.onchange = async () => { if (file.files[0]) await load(file.files[0]); file.value = ""; };
  $("tapeRead").onclick = () => { const s = text.value; closeTape(); readTape(s); };
  $("tapeCancel").onclick = closeTape;
  dlg.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); closeTape(); } });
  status.onclick = stopTape;

  // a file dropped anywhere on the page is put into the reader (and read only after "Read tape")
  window.addEventListener("dragover", (e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); });
  window.addEventListener("drop", async (e) => {
    if (!e.dataTransfer.files[0]) return;
    e.preventDefault();
    if (!tapeOpen()) openTape();
    await load(e.dataTransfer.files[0]);
  });
}

async function load(f) {
  if (f.size > 200_000) { info.textContent = `${f.name} is too long for a paper tape (${Math.round(f.size / 1000)} kB)`; return; }
  text.value = await f.text();
  describe();
}
