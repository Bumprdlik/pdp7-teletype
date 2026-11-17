// The Unix v0 manual panel: the 1970 man pages (man.json) plus a short "v0 tips" page, with search.
import { $ } from "./util.js";

const V0_TIPS = [                              // [topic, text]; not part of the original manual
  ["V0 TIPS", "quick reference, not part of the original 1970 manual"],
  ["LOGIN", "ken/ken, dmr/dmr, doug/doug, system/system"],
  ["PROMPT", "@"],
  ["SHELL", "There is no PATH. Programs live in \"system\" and are linked into the current directory for each run, so commands only work in a directory you may write to."],
  ["ch name", "change directory (there is no cd)"],
  ["ch dd", "go to the root, the \"directory directory\""],
  ["..", "means THIS directory, not the parent. There are no / paths: walk one directory at a time via dd."],
  ["#", "erases the previous character (it stays visible on paper)"],
  ["@", "kills the whole line"],
  ["Esc", "ALT MODE: interrupts a running program, like Ctrl+C today (e.g. ed). The login shell ignores it on purpose. Programs may leave temp files behind (ed: e.tmp)."],
  ["FILES", "ls, list (details), stat, cat, cp, mv, ln, rm, chmod, chown, od"],
  ["ed", "a (append text) ... . (end), p, 1,$p, /word/, w name, q. A reply of ? means error."],
  ["B LANGUAGE", "in dmr's directory: b hello.b hello.s, then as op.s bl.s hello.s bi.s, then a.out"],
  ["DO NOT", "run n.out - it is the assembler's symbol table, not a program. It hangs the machine; use Restart computer."],
  ["", "run init - it is the system's first process; a second copy fights the shell for the terminal."],
  ["LOG OUT", "there is no real logout: Ctrl+D is not end of input in v0 and the shell ignores Esc. To switch users use Restart computer."],
];
const V0_TIPS_TEXT = V0_TIPS.map(([k, v]) => k + " " + v).join("\n");
let manPages = [], manSel = 0, manLoaded = false;
const esc = (t) => t.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

function roffToHtml(src) {                      // the small subset of 1970 roff these pages use
  const out = []; let fill = true, indent = 0, tabs = [], ul = 0, para = [], header = null;
  const flush = () => { if (para.length) { out.push(`<div class="para" style="margin-left:${indent}ch">${para.join(" ")}</div>`); para = []; } };
  const expand = (t) => { let o = "";
    for (const ch of t) { if (ch === "\t") { const stop = tabs.find((x) => x > o.length + indent) ?? (o.length + 8); o = o.padEnd(Math.max(o.length + 1, stop - indent)); } else o += ch; }
    return o; };
  for (const line of src.split("\n")) {
    if (line.startsWith(".")) {
      const cmd = line.slice(1, 3), arg = line.slice(3).trim();
      if (cmd === "oh") { const p = arg.split("'"); header = { l: p[1] || "", c: p[2] || "", r: p[3] || "" }; }
      else if (cmd === "ta") tabs = arg.split(/\s+/).map(Number).filter((n) => n > 0);
      else if (cmd === "sp") { flush(); out.push('<div class="sp"></div>'); }
      else if (cmd === "ul") ul = 1;
      else if (cmd === "in") { flush(); indent = parseInt(arg) || 0; }
      else if (cmd === "nf") { flush(); fill = false; }
      else if (cmd === "fi") { flush(); fill = true; }
      continue;
    }
    let t = esc(line);
    if (ul) { t = `<u>${t}</u>`; ul = 0; }
    if (!fill || line.includes("\t")) { flush(); out.push(`<div class="pre" style="margin-left:${indent}ch">${line.includes("\t") ? esc(expand(line)) : t}</div>`); }
    else if (line.trim() === "") { flush(); out.push('<div class="sp"></div>'); }
    else para.push(t);
  }
  flush();
  const h = header ? `<div class="hdr"><span>${esc(header.r)}</span><span>${esc(header.c)}</span><span>${esc(header.l)}</span></div>` : "";
  return h + out.join("");
}
const plain = (src) => src.split("\n").filter((l) => !l.startsWith(".")).join("\n");
const title = (n) => n.replace(/\.(\d)$/, "($1)");

async function loadMan() {
  if (manLoaded) return; manLoaded = true;
  let pages = [];
  try { pages = await (await fetch("man.json")).json(); } catch (e) {}
  manPages = [{ name: "v0 tips", text: V0_TIPS_TEXT, tips: true }, ...pages];
  renderManList();
}
function renderManList() {
  const q = $("manQ").value.trim().toLowerCase(), list = $("manList");
  const hits = manPages.map((p, i) => {
    const body = (p.tips ? p.text : plain(p.text)).toLowerCase();
    const n = q ? body.split(q).length - 1 + (p.name.toLowerCase().includes(q) ? 1 : 0) : 0;
    return { p, i, n };
  }).filter((h) => !q || h.n > 0);
  list.innerHTML = hits.length ? "" : '<span class="none">nothing found</span>';
  for (const h of hits) {
    const b = document.createElement("button");
    b.innerHTML = esc(h.p.tips ? h.p.name : title(h.p.name)) + (q ? `<small>${h.n}</small>` : "");
    if (h.i === manSel) b.classList.add("sel");
    b.onclick = () => { manSel = h.i; renderManList(); };
    list.appendChild(b);
  }
  if (q && hits.length && !hits.some((h) => h.i === manSel)) { manSel = hits[0].i; return renderManList(); }
  showManPage(q);
}
function showManPage(q) {
  const el = $("manPage"), p = manPages[manSel];
  if (!p) { el.textContent = "No manual pages found (set PDP7_UNIX_MAN)."; return; }
  el.innerHTML = p.tips ? V0_TIPS.map(([k, v], i) => `<div class="tips">${esc(k.padEnd(12))} ${esc(v)}</div>` + (i ? "" : '<div class="sp"></div>')).join("") : roffToHtml(p.text);
  if (!q) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  let first = null;
  for (const n of nodes) {
    const t = n.nodeValue, lo = t.toLowerCase(); let i = lo.indexOf(q); if (i < 0) continue;
    const frag = document.createDocumentFragment(); let last = 0;
    while (i >= 0) { frag.append(t.slice(last, i)); const m = document.createElement("mark"); m.textContent = t.slice(i, i + q.length); frag.append(m); first ??= m; last = i + q.length; i = lo.indexOf(q, last); }
    frag.append(t.slice(last)); n.replaceWith(frag);
  }
  if (first) first.scrollIntoView({ block: "center" });
}

export const manualOpen = () => document.body.classList.contains("manopen");

let hooks = { onOpen() {}, onClose() {}, onLayout() {} };
// onOpen/onClose: what the rest of the page does when the panel opens/closes;
// onLayout: the panel changed the space left for the paper
export function initManual(h) {
  hooks = { ...hooks, ...h };
  $("bMan").onclick = (e) => { e.target.blur(); toggleManual(); };
  $("manClose").onclick = () => toggleManual(false);
  $("manQ").addEventListener("input", () => renderManList());
}

export function toggleManual(force) {
  const m = $("man"), open = force ?? !m.classList.contains("open");
  m.classList.toggle("open", open); $("bMan").classList.toggle("on", open);
  document.body.classList.toggle("manopen", open); hooks.onLayout();
  if (open) {
    hooks.onOpen();
    loadMan();
    if (!matchMedia("(pointer: coarse)").matches) setTimeout(() => $("manQ").focus(), 50);
  } else {
    $("manQ").blur();
    hooks.onClose();
  }
}
