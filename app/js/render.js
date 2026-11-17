// Drawing the paper, the bail, the platen and the print head onto the canvas.
import { FONT, FONT_PX, CW, LH, MARGIN, W, colX } from "./metrics.js";
import { paper } from "./paper.js";
import { layout } from "./layout.js";
import { $, rnd } from "./util.js";

const cv = $("c"), ctx = cv.getContext("2d");

const paperTex = (() => {               // paper texture (fibres + noise), tiled
  const t = document.createElement("canvas"); t.width = 256; t.height = 256;
  const g = t.getContext("2d"), img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 238 + (Math.random() - .5) * 10;
    img.data[i] = v; img.data[i + 1] = v - 3; img.data[i + 2] = v - 11; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.globalAlpha = .05;
  for (let i = 0; i < 90; i++) { g.strokeStyle = Math.random() < .5 ? "#776" : "#fff"; g.beginPath();
    const x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y); g.lineTo(x + rnd(-30, 30), y + rnd(-4, 4)); g.stroke(); }
  return t;
})();
let paperPattern = null;

// each line is drawn once into its own small canvas and reused until it changes
function renderLine(L) {
  const dpr = layout.dpr;
  if (!L.cache) { L.cache = document.createElement("canvas"); L.cache.width = W * dpr; L.cache.height = LH * 2 * dpr; }
  const g = L.cache.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, LH * 2);
  g.font = FONT; g.textBaseline = "alphabetic";
  for (const s of L.strikes) {
    g.save();
    g.translate(MARGIN + s.col * CW + s.dx, LH * 1.35 + s.dy);
    g.rotate(s.r);
    const grad = g.createLinearGradient(0, -FONT_PX * .8, CW * .4, 0);   // uneven strike
    grad.addColorStop(0, `rgba(22,20,24,${s.a1})`); grad.addColorStop(1, `rgba(22,20,24,${s.a2})`);
    g.fillStyle = grad; g.strokeStyle = grad; g.lineJoin = "round";
    g.shadowColor = `rgba(22,20,24,${(s.a1 + s.a2) * .45})`; g.shadowBlur = 2.4;   // ink bleed
    g.lineWidth = s.heavy ? 1.9 : 1.3;                                             // heavy embossed type
    g.strokeText(s.ch, 0, 0);
    g.fillText(s.ch, 0, 0);
    if (s.heavy) { g.shadowBlur = 0; g.fillText(s.ch, .6, .3); }
    g.restore();
  }
  L.dirty = false;
}

export function render() {
  const { h: H, printY: PRINT_Y, short: SHORT, dpr } = layout;
  const { lines, cur } = paper;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const paperBottom = PRINT_Y + 16;
  // paper (texture scrolls with the text)
  if (!paperPattern) paperPattern = ctx.createPattern(paperTex, "repeat");
  const shift = (((cur * LH - paper.scrollAnim - paper.viewOff) % 256) + 256) % 256;
  ctx.save();
  ctx.beginPath(); ctx.rect(30, 0, W - 60, paperBottom); ctx.clip();
  ctx.translate(0, -shift); ctx.fillStyle = paperPattern; ctx.fillRect(0, shift - 256, W, paperBottom + 512);
  ctx.restore();
  // lines
  for (let i = cur; i >= 0; i--) {
    const y = PRINT_Y - (cur - i) * LH + paper.scrollAnim + paper.viewOff - LH * 1.35;
    if (y < -LH * 2) break;
    if (y > H) continue;                      // pulled down behind the platen
    const L = lines[i];
    if (L.dirty) renderLine(L);
    ctx.drawImage(L.cache, 0, y, W, LH * 2);
  }
  // shading at the top (paper curves away from the camera) and roll edges
  const shadeH = SHORT ? LH : H * .45;
  let g = ctx.createLinearGradient(0, 0, 0, shadeH);
  g.addColorStop(0, "rgba(10,9,8,.85)"); g.addColorStop(1, "rgba(10,9,8,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, shadeH);
  g = ctx.createLinearGradient(30, 0, W - 30, 0);
  g.addColorStop(0, "rgba(0,0,0,.35)"); g.addColorStop(.06, "rgba(0,0,0,0)");
  g.addColorStop(.94, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.35)");
  ctx.fillStyle = g; ctx.fillRect(30, 0, W - 60, paperBottom);
  // paper bail above the print line:
  // centre of the gap between the 3rd and 4th line above the print line (baseline + half the gap)
  if (!SHORT) {                               // in a short window the bail would hide a line
    const capH = FONT_PX * .62, bailY = PRINT_Y - LH * 3 + (LH - capH) / 2 + 1.5;
    g = ctx.createLinearGradient(0, bailY - 2.5, 0, bailY + 2.5);
    g.addColorStop(0, "#fafafa"); g.addColorStop(.5, "#9a9a9a"); g.addColorStop(1, "#3a3a3a");
    ctx.fillStyle = g; ctx.fillRect(0, bailY - 2.5, W, 5);
    ctx.fillStyle = "rgba(0,0,0,.14)"; ctx.fillRect(30, bailY + 2.5, W - 60, 3);
  }
  // platen
  g = ctx.createLinearGradient(0, paperBottom, 0, H);
  g.addColorStop(0, "#2c2b29"); g.addColorStop(.25, "#0d0d0c"); g.addColorStop(.6, "#1d1c1a"); g.addColorStop(1, "#050505");
  ctx.fillStyle = g; ctx.fillRect(0, paperBottom, W, H - paperBottom);
  // print head with type cylinder
  paper.headX += (colX(paper.col) - paper.headX) * .35;
  if (!SHORT) drawHead(paper.headX + CW / 2, PRINT_Y + 18);
  else { ctx.fillStyle = "#a77c2c"; ctx.fillRect(paper.headX, paperBottom + 3, CW, 4); }   // just a column marker
}

// the print head is still moving towards the print column
export const headMoving = () => Math.abs(colX(paper.col) - paper.headX) > .5;

function drawHead(x, y) {
  ctx.save();
  ctx.fillStyle = "#111"; ctx.beginPath(); ctx.roundRect(x - 70, y - 8, 140, 22, 6); ctx.fill();   // ribbon guide
  ctx.fillStyle = "#1c1a1c"; ctx.fillRect(x - 90, y - 6, 180, 6);                                 // ribbon
  const g = ctx.createRadialGradient(x - 8, y + 30, 4, x, y + 38, 40);
  g.addColorStop(0, "#5b5b5b"); g.addColorStop(.5, "#202020"); g.addColorStop(1, "#050505");
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y + 40, 34, 42, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(200,200,200,.18)";                                                       // characters on the cylinder
  for (let r = 0; r < 6; r++) for (let k = -3; k <= 3; k++) ctx.fillRect(x + k * 8 - 2, y + 14 + r * 9, 4, 5);
  ctx.fillStyle = "#9a9a9a"; ctx.beginPath(); ctx.arc(x, y + 16, 7, 0, Math.PI * 2); ctx.fill();   // hub nut
  ctx.restore();
}
