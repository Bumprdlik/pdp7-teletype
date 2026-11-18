// The Unix v0 manual panel: the 1970 man pages (man.json) plus short "v0 tips", "ed", "b" and "as" pages, with search.
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
  ["ed", "a (append text) ... . (end), p, 1,$p, /word/, w name, q. A reply of ? means error. More on the \"ed (editor)\" page."],
  ["B LANGUAGE", "in dmr's directory: b hello.b hello.s, then as op.s bl.s hello.s bi.s, then a.out. More on the \"b (language)\" page."],
  ["DO NOT", "run n.out - it is the assembler's symbol table, not a program. It hangs the machine; use Restart computer."],
  ["", "run init - it is the system's first process; a second copy fights the shell for the terminal."],
  ["LOG OUT", "there is no real logout: Ctrl+D is not end of input in v0 and the shell ignores Esc. To switch users use Restart computer."],
];
const ED = [                                   // [topic, text], or [heading, null]; checked against v0 ed in SIMH
  ["ED", "the editor. After \"An introduction to the UNIX ed line editor\" (Computer History Wiki, GFDL 1.2), cut down to what the 1970 ed can do."],
  ["STARTING AND ENDING", null],
  ["ed", "start the editor; it prints \"edit\". It takes no file name: load a file with r."],
  ["r name", "read file \"name\" into the buffer (at the end); prints the number of characters"],
  ["w", "write the buffer to the file last read or written (? if there is none yet)"],
  ["w name", "write the whole buffer into \"name\" (at most 8 characters); prints the number of characters"],
  ["2,5w name2", "write lines 2 to 5 into \"name2\""],
  ["q", "leave the editor at once. It does NOT ask about unsaved changes: w first."],
  ["MODES", "ed starts in command mode; a and c switch to text mode. A line with only a dot (.) goes back to command mode."],
  ["?", "the only error message: bad command, no such line, empty buffer, file not found..."],
  ["LINES", null],
  [".", "current line"],
  ["$", "last line"],
  ["5", "line 5 (a leading 0 means octal: 010 is line 8)"],
  [".-1  $-2", "counted from . or $"],
  ["2,5", "lines 2 to 5 (inclusive)"],
  ["1,$", "all lines"],
  ["/text/", "next line containing \"text\" (wraps around); ?text? searches backwards; // repeats the last search"],
  ["^  $", "in a search: start / end of the line. Nothing else is special: . * [ match themselves."],
  ["ENTERING TEXT", null],
  ["4a", "append after line 4"],
  ["a", "without a line number: append at the end of the file"],
  ["0a", "insert before line 1. There is no i: to insert before line 3 use 2a."],
  ["5c", "replace line 5 with new text"],
  ["3,8c", "replace lines 3 to 8 (inclusive) with new text"],
  ["#  @", "erase and kill work in text mode too, so these two characters cannot be put into a file"],
  ["LIST, DELETE, CHANGE", null],
  ["p", "print the current line"],
  ["2p", "print line 2"],
  ["3,7p", "print lines 3 to 7 (inclusive)"],
  ["RETURN", "an empty line prints the next line; a line number alone (5) prints that line"],
  ["=", "number of lines; .= the current line number"],
  ["10d", "delete line 10"],
  ["2,5d", "delete lines 2 to 5 (inclusive)"],
  ["s/old/new/", "substitute the first \"old\" with \"new\" in the current line. The closing / is required."],
  ["3,8s/a/b/", "the same in lines 3 to 8; 1,$s/a/b/ in the whole file. Only the first match in each line; no g, no &."],
  ["Esc", "interrupts ed (the edits are lost); it leaves e.tmp behind"],
  ["NOT IN V0", null],
  ["", "ed name, i (insert), n (numbered list), t (copy), m (move), u (undo), ! (shell command), Q, g: all came later."],
];
const B = [                                    // [topic, text], or [heading, null]; checked with b.b in SIMH
  ["B", "the language Ken Thompson wrote for the PDP-7, the parent of C. The original PDP-7 B is lost; this disk has a 2016 reconstruction of the compiler (b.b, Robert Swierczek)."],
  ["BUILD AND RUN", null],
  ["where", "in dmr's directory (log in as dmr/dmr): b, as and the run-time files op.s bl.s bi.s are there"],
  ["ed x.b", "write the program (see the ed page)"],
  ["b x.b x.s", "compile B into assembly. Silent when all is well; an error prints a two-letter code and the line number, e.g. sz12"],
  ["as ...", "as op.s bl.s x.s bi.s - always these four, in this order. It prints I, II and the file names and makes a.out."],
  ["a.out", "run the program. a.out in: read() reads file \"in\"; a.out in out: write() also goes into a new file \"out\"."],
  ["DO NOT", "run n.out: it is the assembler's symbol table and hangs the machine"],
  ["PROGRAM", null],
  ["main() $( $)", "a function; the program starts in main. $( and $) are the braces: the Teletype has no { }."],
  ["f(a, b) $(", "a function with parameters. return(x); or return; leaves it."],
  ["auto", "auto i, j; local variables. auto v 10; is a local vector of 10 words (no brackets)."],
  ["extrn", "extrn x; inside a function lets it use the global x. Calling functions needs no extrn."],
  ["x;  x 5;", "a global variable (outside any function), 0 or 5 at the start"],
  ["x[10];", "a global vector; x[3] 1, 2, 3; also gives initial values"],
  ["/* ... */", "a comment"],
  ["STATEMENTS", null],
  ["if (c) s", "if (c) s; else s2; - else is optional"],
  ["while (c) s", "the only loop: there is no for, do, switch, break or continue"],
  ["$( ... $)", "several statements as one"],
  ["l: goto l;", "a label and a jump"],
  ["EXPRESSIONS", null],
  ["= + - * / %", "assignment and arithmetic on 18-bit words. / and % give wrong results for negative numbers."],
  ["== != < >", "comparisons, also <= and >="],
  ["& |", "and, or (bitwise; they also work in conditions). There is no && || << >> ++ -- =+ or ?:"],
  ["! -", "not, minus"],
  ["*p  &x", "the word p points to; the address of x"],
  ["v[i]", "word i of vector v, the same as *(v + i)"],
  ["VALUES", null],
  ["123  010", "decimal; a leading 0 means octal (010 is 8)"],
  ["'a'  'ab'", "a character constant: one or two characters in one word"],
  ["\"text\"", "a string: two characters per word, ending with *e. Nothing in the library prints it: see PRINTING."],
  ["*n *t *0 *e", "newline, tab, NUL, end of file. *( *) give { }; ** *' *\" give * ' \"."],
  ["LIBRARY", null],
  ["write(c)", "print the one or two characters in c: write('hi'); write('*n');"],
  ["read()", "the next character of input; *e (the number 4) at the end"],
  ["flush()", "print what write() keeps in its buffer now (it happens anyway when the program ends)"],
  ["PRINTING", null],
  ["printn(n)", "a number (n >= 0):\nprintn(n) $(\n  if (n > 9) printn(n / 10);\n  write(n % 10 + '0');\n$)"],
  ["puts(s)", "a string:\nputs(s) $(\n  auto w;\n  while (1) $(\n    w = *s;\n    if (w / 512 == 4) return;\n    if (w % 512 == 4) $( write(w / 512 * 512); return; $)\n    write(w);\n    s = s + 1;\n  $)\n$)"],
];
const AS = [                                   // [topic, text], or [heading, null]; checked with as in SIMH
  ["AS", "the PDP-7 assembler. Unix v0 itself, ed, as and all the commands are written with it."],
  ["BUILD AND RUN", null],
  ["where", "in dmr's directory (log in as dmr/dmr): as and op.s, the names of the instructions, are there"],
  ["as op.s x.s", "assemble. op.s comes first: it defines lac, dac, sys, write... It prints I, II and the file names and writes a.out."],
  ["errors", "a letter and the line number, e.g. u 0001: u undefined symbol, x syntax, g bad character. a.out is written anyway: read the errors before running it."],
  ["a.out", "run the program. Esc or Restart computer stops one that never ends."],
  ["DO NOT", "run n.out: it is the symbol table as writes, and it hangs the machine"],
  ["SYNTAX", null],
  ["\" text", "a comment, to the end of the line"],
  ["label:", "a name for the next word: letters, digits and dots (no _)"],
  ["1:  1f  1b", "local labels 0-9: 1f is the next 1:, 1b the previous one"],
  ["a; b; c", "several words on one line"],
  ["x = 5", "defines a symbol, makes no word"],
  ["lac x i", "the parts of a word are added: instruction + address + i (indirect)"],
  ["123  017", "decimal; a leading 0 means octal"],
  ["<ab>  <x", "characters: <a puts a into the high half of a word, b> into the low half. <he>;<ll>;<o 012 is hello and a newline."],
  [".=.+64", "reserve 64 words"],
  ["-5", "a negative number is a law instruction: it loads -5 into AC"],
  ["MACHINE", null],
  ["AC", "the only register, 18 bits. The link is a carry bit; MQ is the EAE register for mul, idiv and long shifts."],
  ["memory", "a program runs in the upper 4K words (from 010000). There are no immediate values: a constant is a word in memory, d1: 1."],
  ["010-017", "these locations count up by one each time they are used indirectly (lac 010 i): index registers"],
  ["INSTRUCTIONS", null],
  ["lac dac dzm", "load AC from memory, store AC, store zero"],
  ["tad add", "add (two's / one's complement)"],
  ["and xor", "logic with a word in memory"],
  ["isz x", "add 1 to x and skip the next word if it became 0. Loops count up from -n."],
  ["sad x", "skip if AC differs from x"],
  ["jmp", "jump"],
  ["xct x", "execute the instruction stored in x"],
  ["jms x", "call: stores the return address in x and goes on at x+1. Return with jmp x i."],
  ["cla cma cll", "clear AC, complement AC, clear the link"],
  ["clc", "AC = -1 (all ones)"],
  ["cml stl", "complement the link, set the link to 1"],
  ["glk", "AC = the link (0 or 1)"],
  ["sza sna", "skip if AC is zero / not zero"],
  ["sma spa", "skip if AC is minus / plus (zero is plus)"],
  ["snl szl", "skip if the link is 1 / 0"],
  ["skp", "always skip"],
  ["ral rar", "rotate AC and link left / right; rcl rcr clear the link first"],
  ["rtl rtr", "rotate by two"],
  ["las oas", "load the console switches into AC / OR them into AC"],
  ["nop", "do nothing"],
  ["hlt", "halts the whole computer, not just the program: do not use it"],
  ["sna cla", "operate instructions can be combined in one word; the hardware decides the order"],
  ["alss 9", "shift AC left by 9, one character up; lrss 9 shifts down. lmq / lacq: AC to MQ and back."],
  ["EAE", "mul, idiv and about 30 more multiply, divide and shift instructions: see op.s"],
  ["SYSTEM CALLS", null],
  ["sys ...", "arguments are the words after the call; AC carries a value in and the result out"],
  ["exit", "sys exit - end the program"],
  ["write", "lac d1; sys write; buf; n - write n words (2n characters) from buf; file 1 is the terminal. NUL characters are not printed."],
  ["read", "lac fd; sys read; buf; n - read up to n words; AC = words read, 0 at the end"],
  ["open", "sys open; name; 0 - open for reading; AC = fd, negative on error (check with spa)"],
  ["creat", "lac o17; sys creat; name - create or empty a file for writing; AC = fd"],
  ["close", "lac fd; sys close"],
  ["file names", "4 words, 8 characters padded with spaces: <he>;<ll>;<o.>;<b 040 is hello.b"],
  ["more", "op.s lists all calls: seek, chdir, unlink, fork, time..."],
  ["EXAMPLE", null],
  ["hello", "prints hello, then ab five times:\n   lac d1\n   sys write; s; 3\n   -5\n   dac c\n1: lac d1\n   sys write; t; 1\n   isz c\n   jmp 1b\n   sys exit\ns: <he>;<ll>;<o 012\nt: <ab>\nd1: 1\nc: 0"],
];
const BUILTIN = [                              // extra pages, not part of the original manual
  { name: "v0 tips", rows: V0_TIPS },
  { name: "ed (editor)", rows: ED },
  { name: "b (language)", rows: B },
  { name: "as (assembler)", rows: AS },
].map((p) => ({ ...p, tips: true, text: p.rows.map(([k, v]) => k + " " + (v ?? "")).join("\n") }));
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
  manPages = [...BUILTIN, ...pages];
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
  el.innerHTML = p.tips ? p.rows.map(([k, v], i) => v === null
    ? `<div class="sp"></div><div class="tips"><b>${esc(k)}</b></div>`
    : `<div class="tips">${esc(k.padEnd(12))} ${esc(v)}</div>` + (i ? "" : '<div class="sp"></div>')).join("") : roffToHtml(p.text);
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
