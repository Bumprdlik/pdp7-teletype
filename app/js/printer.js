// The print loop: characters from the PDP-7 wait in a queue and are printed at CPS chars per
// second (Turbo: much faster), with sound. Runs every animation frame and redraws when needed.
import { paper, printChar, newPaper } from "./paper.js";
import { updatePan } from "./layout.js";
import { render, headMoving } from "./render.js";
import { play } from "./sound.js";

const queue = [];
const CPS = 20;                       // a real Model 33 does 10; twice that feels closer to the films
let turbo = false, budget = 0, last = 0;
let printed = "";                     // everything printed (latest 100-200 kB), for tests and debugging

export const enqueue = (text) => { for (const ch of text) queue.push(ch); };
export const queued = () => queue.length;
export const printedText = () => printed;
export const turboOn = () => turbo;
export function toggleTurbo() { turbo = !turbo; return turbo; }

function out(ch, sound) {
  printed += ch; if (printed.length > 200000) printed = printed.slice(-100000);
  const name = printChar(ch);
  if (sound && name) play(name);
}

// teletype.py sends what was printed before the page connected: put it on a fresh sheet at once
export function replaceWithHistory(text) {
  newPaper(); paper.col = 0; queue.length = 0;
  for (const ch of text) out(ch, false);
  paper.scrollAnim = 0;
}

function frame(t) {
  const dt = last ? (t - last) / 1000 : 0; last = t;
  budget += dt * (turbo ? 3000 : CPS);
  let n = 0;
  while (budget >= 1 && queue.length) { budget--; out(queue.shift(), !turbo || n++ % 40 === 0); }
  if (!queue.length) budget = Math.min(budget, 1);
  if (paper.scrollAnim > .3) { paper.scrollAnim *= Math.pow(.0005, dt); paper.dirty = true; } else paper.scrollAnim = 0;
  updatePan(dt);
  if (Math.abs(paper.viewTarget - paper.viewOff) > .3) { paper.viewOff += (paper.viewTarget - paper.viewOff) * Math.min(1, dt * 14); paper.dirty = true; }
  else if (paper.viewOff !== paper.viewTarget) { paper.viewOff = paper.viewTarget; paper.dirty = true; }
  if (headMoving()) paper.dirty = true;
  if (paper.dirty) { render(); paper.dirty = false; }
  requestAnimationFrame(frame);
}
export const startPrinting = () => requestAnimationFrame(frame);
