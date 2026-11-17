// Fitting the paper to the window, and panning it sideways on phones in portrait.
//
// Phones: in portrait the whole 72-column line would make the type tiny, so the paper is shown
// larger and pans sideways after the print head (pan). In a short window (landscape with the
// keyboard open) the print head is left out and only the paper is shown (short).
// The portrait scale can be changed with A− / A+ in the menu and is remembered.
import { W, colX } from "./metrics.js";
import { paper } from "./paper.js";
import { $, clamp } from "./util.js";

export const layout = {
  dpr: 1, scale: 1,           // device pixels per CSS pixel, CSS pixels per canvas unit
  h: 0, printY: 0,            // canvas height and the print line (canvas units)
  pan: false, visW: 0,        // paper wider than the window: pans; visible width (canvas units)
  short: false,               // so little height that the print head is left out
  panX: 0,                    // current sideways pan (canvas units)
};
let panTarget = 0, panManual = false, panCol = -1;

const TYPE_SCALES = [.4, .5, .6, .7, .8, .9, 1];
const SCALE_KEY = "pdp7-portrait-scale";
let portraitScale = .7;
try { const v = parseFloat(localStorage.getItem(SCALE_KEY)); if (TYPE_SCALES.includes(v)) portraitScale = v; } catch (e) {}

// Orientation of the phone itself. The window can't tell: in portrait, the on-screen keyboard
// leaves a window that is wider than tall.
function phonePortrait() {
  const o = screen.orientation && screen.orientation.type;
  return o ? o.startsWith("portrait") : screen.height > screen.width;
}

export function resize() {
  const cv = $("c"), stage = $("stage"), bar = $("bar");
  layout.dpr = window.devicePixelRatio || 1;
  const compact = matchMedia("(max-width: 900px), (pointer: coarse)").matches;
  // full-screen manual on phones: the paper stays behind it; on desktop the manual takes a side
  const manW = !compact && document.body.classList.contains("manopen") ? $("man").offsetWidth : 0;
  const touch = matchMedia("(pointer: coarse)").matches, portrait = phonePortrait();
  const side = touch && !portrait;                     // phone in landscape: the bar is a column
  document.body.classList.toggle("side", side);
  const vv = window.visualViewport;
  const viewH = vv ? vv.height : window.innerHeight;  // minus the phone keyboard
  const availW = window.innerWidth - manW - (side ? bar.offsetWidth : compact ? 0 : 24);
  const fit = Math.min(1, availW / W);
  const wantLarge = compact && (touch ? portrait : window.innerHeight > window.innerWidth);
  layout.scale = wantLarge ? Math.max(fit, portraitScale) : fit;
  layout.pan = W * layout.scale > availW + 1;
  layout.visW = availW / layout.scale;
  layout.short = viewH < 360;
  const top = layout.short && !side ? bar.offsetHeight : 0;   // don't print under the button bar
  layout.h = Math.round((viewH - 10 - top) / layout.scale);
  layout.printY = layout.short ? layout.h - 34 : layout.h - 120;
  cv.width = W * layout.dpr; cv.height = layout.h * layout.dpr;
  cv.style.width = W * layout.scale + "px"; cv.style.height = layout.h * layout.scale + "px";
  stage.style.justifyContent = layout.pan ? "flex-start" : "";
  // iOS does not shrink the page for the keyboard, it covers it: keep the paper above the keyboard
  stage.style.bottom = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + "px" : "";
  if (!layout.pan) layout.panX = panTarget = 0;
  panTarget = clamp(panTarget, 0, Math.max(0, W - layout.visW)); layout.panX = panTarget; applyPan();
  paper.dirty = true;
}

export function changeTypeSize(step) {
  const i = TYPE_SCALES.indexOf(portraitScale);
  portraitScale = TYPE_SCALES[clamp(i + step, 0, TYPE_SCALES.length - 1)];
  try { localStorage.setItem(SCALE_KEY, String(portraitScale)); } catch (e) {}
  resize();
}

// ---------- sideways panning ----------
function applyPan() {
  $("tilt").style.transform = `translateX(${(-layout.panX * layout.scale).toFixed(1)}px) rotateX(13deg)`;
}

// every frame: follow the print head unless the reader dragged the paper aside
export function updatePan(dt) {
  if (!layout.pan) return;
  if (paper.col !== panCol) { panCol = paper.col; panManual = false; }   // the head moved: follow it again
  if (!panManual) {
    const hx = colX(paper.col);
    if (hx > panTarget + layout.visW - 60) panTarget = hx - layout.visW + 160;   // ran off the right: jump ahead a bit
    else if (hx < panTarget + 30) panTarget = hx - 60;                          // carriage return
    panTarget = clamp(panTarget, 0, W - layout.visW);
  }
  if (Math.abs(panTarget - layout.panX) > .5) { layout.panX += (panTarget - layout.panX) * Math.min(1, dt * 10); applyPan(); }
  else if (layout.panX !== panTarget) { layout.panX = panTarget; applyPan(); }
}

// dragging with a finger: the reader decides where to look until the head moves again
export const panPosition = () => panTarget;
export function panTo(x) {
  panManual = true;
  panTarget = clamp(x, 0, W - layout.visW); layout.panX = panTarget; applyPan();
}
