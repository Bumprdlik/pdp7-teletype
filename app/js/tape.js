// The paper tape reader of the Model 33 ASR: a program is pasted or loaded from a file, and the
// reader "types" it to the PDP-7 at 10 characters per second (Turbo: faster), exactly as if it
// were typed on the keyboard - v0 echoes it, so it is printed on the paper too.
//
// With a file name, the reader saves the tape as that file: from the shell's @ prompt it starts
// ed, waits until ed runs, types a, the tape, then . w name q. Without one it just types into
// whatever runs - at the @ prompt every line would be run as a command, so the dialog warns.
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
const ED_TIMEOUT = 10000;              // ms for ed to start and print "edit"
const dlg = $("tape"), text = $("tapeText"), nameIn = $("tapeName"), file = $("tapeFile");
const info = $("tapeInfo"), warn = $("tapeWarn"), readBtn = $("tapeRead"), status = $("tapeStatus");
let send = null, onOpen = () => {};

let tail = "";                         // the last characters the PDP-7 printed (as received, not as printed yet)
// job: what the reader is doing - null, or { phase: "ed" | "tape", tape, pos, name, ... }
let job = null, lastJob = null, timer = 0, budget = 0, last = 0, statusTimer = 0;

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

// the shell is waiting for a command: the last printed line is just its "@ " prompt
const atShellPrompt = () => /(^|[\r\n])@ $/.test(tail);
// a v0 file name: at most 8 characters (a directory entry holds 4 words); keep to the safe ones
const validName = (n) => /^[a-z0-9._-]{1,8}$/.test(n);
const fileName = () => nameIn.value.trim().toLowerCase();

// everything the PDP-7 prints passes through here (main.js)
export function tapeOutput(d) {
  tail = (tail + d).slice(-200);
  if (job && job.phase === "ed") {
    job.edOut += d;
    if (/edit[\r\n]/.test(job.edOut)) {          // ed runs: append mode, then the tape after a short pause
      send("a\r");
      job.phase = "tape"; job.startAt = performance.now() + 400;
    }
  }
}

export const tapeOpen = () => !dlg.hidden;
export const tapeReading = () => !!job;
// for tests and debugging: the running job, or where the last one ended
export function tapeProgress() {
  const j = job || lastJob;
  return { reading: !!job, phase: job ? job.phase : null, pos: j ? j.pos : 0, len: j ? j.tape.length : 0 };
}

export function openTape() { onOpen(); dlg.hidden = false; describe(); text.focus(); }
export function closeTape() { dlg.hidden = true; document.activeElement.blur(); }

function describe() {
  const { chars, skipped, braces, erasers } = tapeChars(text.value);
  const name = fileName();
  const lines = chars ? chars.split("\r").length - (chars.endsWith("\r") ? 1 : 0) : 0;
  const secs = Math.ceil(chars.length / (turboOn() ? TURBO_CPS : CPS));
  const n = (k, what) => `${k} ${what}${k === 1 ? "" : "s"}`;
  info.textContent = !chars ? "" : [
    `${n(chars.length, "character")}, ${n(lines, "line")}, about ${secs < 90 ? secs + " s" : Math.round(secs / 60) + " min"}`,
    braces && `${n(braces, "brace")} { } will be read as $( $)`,
    erasers && `contains # or @, which erase as when typed`,
    skipped && `${n(skipped, "character")} a Model 33 cannot send will be left out`,
  ].filter(Boolean).join(" · ");

  // problems: blocking ones disable Read tape, the rest only warn
  let problem = "", blocking = false;
  if (name && !validName(name)) { problem = "A v0 file name has at most 8 characters: letters, digits, . _ -"; blocking = true; }
  else if (name && /(^|\r)\.(\r|$)/.test(chars)) { problem = "A line with only . would end ed's input early - the rest would run as ed commands."; blocking = true; }
  else if (name && !atShellPrompt()) { problem = "Saving starts ed from the shell, so it needs the @ prompt: finish the running program first (in ed: . and q)."; blocking = true; }
  else if (!name && chars && atShellPrompt()) problem = "The shell is waiting (@): every line will run as a command. To keep the program, give it a file name.";
  warn.textContent = problem;
  readBtn.disabled = !chars || blocking;
  readBtn.textContent = name && !blocking ? `Save as ${name}` : "Read tape";
}

function showStatus(msg) {
  clearTimeout(statusTimer);
  if (msg) { status.hidden = false; status.textContent = msg; statusTimer = setTimeout(() => (status.hidden = true), 5000); return; }
  status.hidden = !job;
  if (!job) return;
  const target = job.name ? ` → ${job.name}` : "";
  status.textContent = job.phase === "ed" ? `Starting ed${target} · tap to stop`
    : `Reading tape${target} ${Math.round(100 * job.pos / job.tape.length)} % · tap to stop`;
}

function tick() {
  const now = performance.now();
  if (job.phase === "ed") {
    if (now > job.edDeadline) { stopTape(); showStatus("ed did not start - the tape was not read"); }
    last = now; return;
  }
  if (now < job.startAt) { last = now; return; }
  budget += (now - last) / 1000 * (turboOn() ? TURBO_CPS : CPS); last = now;
  // a background tab only ticks once a second: catch up, but never in one big burst
  budget = Math.min(budget, 8);
  const k = Math.floor(budget);
  if (k > 0) { budget -= k; send(job.tape.slice(job.pos, job.pos + k)); job.pos += k; }
  if (job.pos >= job.tape.length) stopTape(); else showStatus();
}

// read the text; with a name, save it as that file via ed (call only at the shell prompt)
export function readTape(s, name = "") {
  stopTape();
  let tape = tapeChars(s).chars;
  if (!tape) return;
  if (name) {
    if (!tape.endsWith("\r")) tape += "\r";      // or the "." would end up on the last line
    tape += `.\rw ${name}\rq\r`;
    send("ed\r");
    job = { phase: "ed", tape, pos: 0, name, edOut: "", edDeadline: performance.now() + ED_TIMEOUT };
  } else job = { phase: "tape", tape, pos: 0, name: "", startAt: 0 };
  budget = 1; last = performance.now();
  timer = setInterval(tick, 50);
  tick();
}

export function stopTape() {
  if (timer) clearInterval(timer);
  timer = 0; lastJob = job || lastJob; job = null; showStatus();
}

// send(text): to the PDP-7; onOpen(): the dialog is about to open (close the menu, the keyboard...)
export function initTape(opts) {
  send = opts.send; onOpen = opts.onOpen || onOpen;
  text.addEventListener("input", describe);
  nameIn.addEventListener("input", describe);
  nameIn.addEventListener("keydown", (e) => { if (e.key === "Enter" && !readBtn.disabled) { e.preventDefault(); readBtn.click(); } });
  $("tapeChoose").onclick = () => file.click();
  file.onchange = async () => { if (file.files[0]) await load(file.files[0]); file.value = ""; };
  readBtn.onclick = () => { const s = text.value, name = fileName(); closeTape(); readTape(s, name); };
  $("tapeCancel").onclick = closeTape;
  dlg.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); closeTape(); } });
  status.onclick = () => { stopTape(); };

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
  const n = f.name.toLowerCase();
  if (!fileName() && validName(n)) nameIn.value = n;     // hello.b is saved as hello.b
  describe();
}
