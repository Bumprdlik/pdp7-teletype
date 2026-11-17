// The paper: printed lines and the print position, plus scrolling back through it.
// This module owns the paper state; render.js draws it and printer.js feeds it characters.
import { COLS, LH, MARGIN } from "./metrics.js";
import { $, rnd, hash } from "./util.js";

export const paper = {
  lines: [], cur: 0, col: 0,  // printed lines, index of the line being printed, print column
  scrollAnim: 0,              // remaining line-feed animation (pixels)
  viewOff: 0, viewTarget: 0,  // scrollback: how far the paper is pulled back down (pixels)
  headX: MARGIN,              // animated x of the print head
  ribbon: 1,                  // ink left on the ribbon
  dirty: true,                // the canvas needs redrawing
};

const mkLine = () => ({ strikes: [], cache: null, dirty: true });

// A clean sheet. The carriage stays where it is (tearing off paper doesn't move the print head).
export function newPaper() {
  paper.lines = [mkLine()]; paper.cur = 0;
  paper.viewOff = paper.viewTarget = 0; paper.dirty = true;
  $("back").style.display = "none";
}

// pseudo-random wear: every character on the type cylinder is worn a bit differently
const glyphWear = {};
for (let c = 32; c < 128; c++) glyphWear[c] = { dy: (hash(c) - .5) * 2.4, dx: (hash(c + 999) - .5) * 1.2, ink: .82 + hash(c + 77) * .18 };

function strike(ch) {
  const code = ch.charCodeAt(0), wear = glyphWear[code] || glyphWear[63];
  const c = Math.min(paper.col, COLS - 1);         // at end of line it overprints the last column
  const ink = wear.ink * rnd(.62, 1) * paper.ribbon;
  const line = paper.lines[paper.cur];
  line.strikes.push({
    ch, col: c,
    dx: wear.dx + rnd(-.6, .6), dy: wear.dy + rnd(-.9, .9), r: rnd(-.025, .025),
    a1: ink * rnd(.55, 1), a2: ink * rnd(.55, 1), heavy: Math.random() < .35,
  });
  line.dirty = true;
  paper.ribbon = Math.max(.75, paper.ribbon - .00002);   // the ribbon slowly fades
}

// Print one character. Returns the name of the machine sound it makes (or null).
export function printChar(ch) {
  const code = ch.charCodeAt(0) & 0x7f;
  let sound = null;
  if (code === 13) { paper.col = 0; sound = "cr"; }
  else if (code === 10) {
    paper.lines.push(mkLine()); paper.cur++; paper.scrollAnim += LH;
    if (paper.lines.length > 3000) { paper.lines.splice(0, 1000); paper.cur -= 1000; }
    sound = "lf";
  }
  else if (code === 7) sound = "bell";
  else if (code === 9) { do { paper.col++; } while (paper.col % 8 && paper.col < COLS); sound = "space"; }
  else if (code === 32) { paper.col = Math.min(paper.col + 1, COLS); sound = "space"; }
  else if (code > 32 && code < 127) {
    strike(String.fromCharCode(code).toUpperCase());   // the Model 33 prints upper case only
    paper.col = Math.min(paper.col + 1, COLS);
    sound = "strike";
  }
  paper.dirty = true;
  return sound;
}

// Scroll back: px = how far the paper is pulled down (0 = the print line).
export function scrollTo(px) {
  paper.viewTarget = Math.max(0, Math.min(px, paper.cur * LH));
  $("back").style.display = paper.viewTarget > 0 ? "block" : "none";
}
