// Mouse wheel and touch on the paper: wheel/drag up and down scrolls back through the paper,
// a sideways drag pans it (phones in portrait), a tap calls onTap (opens the phone keyboard).
import { LH } from "./metrics.js";
import { paper, scrollTo } from "./paper.js";
import { layout, panPosition, panTo } from "./layout.js";
import { $ } from "./util.js";

export function initGestures({ onTap }) {
  window.addEventListener("wheel", (e) => {
    if (e.target.closest && e.target.closest("#man, #tape")) return;   // the manual and the tape dialog scroll by themselves
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * LH : e.deltaMode === 2 ? e.deltaY * layout.h : e.deltaY;
    scrollTo(paper.viewTarget - d);                // wheel up = pull the paper down = read older text
  }, { passive: false });

  const stage = $("stage");
  let drag = null, dragged = false;
  stage.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    drag = { x: t.clientX, y: t.clientY, pan: panPosition(), view: paper.viewTarget, axis: null };
    dragged = false;
  }, { passive: true });
  stage.addEventListener("touchmove", (e) => {
    if (!drag || e.touches.length !== 1) return;
    const t = e.touches[0], dx = t.clientX - drag.x, dy = t.clientY - drag.y;
    if (!drag.axis && Math.hypot(dx, dy) > 8) drag.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    if (!drag.axis) return;
    e.preventDefault(); dragged = true;
    if (drag.axis === "x" && layout.pan) panTo(drag.pan - dx / layout.scale);
    else if (drag.axis === "y") scrollTo(drag.view + dy / layout.scale);   // pull the paper down = older text
  }, { passive: false });
  stage.addEventListener("touchend", () => { drag = null; }, { passive: true });
  stage.addEventListener("click", () => { if (dragged) { dragged = false; return; } onTap(); });
}
