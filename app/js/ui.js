// The button bar, the ☰ menu (phones and small windows) and the POWER ON overlay.
import { BUILD } from "./config.js";
import { newPaper, scrollTo } from "./paper.js";
import { changeTypeSize } from "./layout.js";
import { toggleTurbo as printerTurbo } from "./printer.js";
import { toggleLid as soundLid, initAudio } from "./sound.js";
import { keyboardOpen, showKeyboard, hideKeyboard, onKeyboardChange } from "./keyboard.js";
import { openTape } from "./tape.js";
import { $ } from "./util.js";

const more = $("more"), bMenu = $("bMenu");

export const menuOpen = () => more.classList.contains("open");
export function closeMenu() { more.classList.remove("open"); bMenu.classList.remove("on"); bMenu.setAttribute("aria-expanded", "false"); }
function toggleMenu() {
  const open = !menuOpen();
  more.classList.toggle("open", open); bMenu.classList.toggle("on", open); bMenu.setAttribute("aria-expanded", String(open));
}

// the buttons show the state, also when it is switched with F5 / F7
export function toggleTurbo() { $("bTurbo").classList.toggle("on", printerTurbo()); }
export function toggleLid() { $("bLid").classList.toggle("on", soundLid()); }

// safety: the first click only asks
function confirmButton(id, question, action) {
  const b = $(id), label = b.textContent;
  b.onclick = () => {
    b.blur();
    if (!b.dataset.armed) { b.dataset.armed = 1; b.textContent = question; b.classList.add("on");
      setTimeout(() => { delete b.dataset.armed; b.textContent = label; b.classList.remove("on"); }, 3000); return; }
    delete b.dataset.armed; b.textContent = label; b.classList.remove("on");
    closeMenu(); action();
  };
}

// conn: the PDP-7 connection from transport.js
export function initUI(conn) {
  $("build").textContent = "build " + BUILD;

  // Tapping a bar button must not take the focus from the hidden field (that would close the keyboard).
  for (const b of document.querySelectorAll("#bar button"))
    for (const t of ["pointerdown", "mousedown"]) b.addEventListener(t, (e) => e.preventDefault());

  bMenu.onclick = toggleMenu;
  document.addEventListener("pointerdown", (e) => { if (!e.target.closest("#more, #bMenu")) closeMenu(); });

  const bKbd = $("bKbd");
  onKeyboardChange((open) => bKbd.classList.toggle("on", open));
  bKbd.onclick = () => (keyboardOpen() ? hideKeyboard() : showKeyboard());
  $("bEsc").onclick = () => conn.send("\x1b");

  $("bSmaller").onclick = () => changeTypeSize(-1);
  $("bLarger").onclick = () => changeTypeSize(1);
  $("bTurbo").onclick = (e) => { toggleTurbo(); e.target.blur(); };
  $("bLid").onclick = (e) => { toggleLid(); e.target.blur(); };
  $("back").onclick = () => scrollTo(0);
  $("bTape").onclick = (e) => { e.target.blur(); openTape(); };
  $("bTear").onclick = (e) => { newPaper(); e.target.blur(); closeMenu(); };
  confirmButton("bReset", "Really restart?", () => conn.restart());
  if (conn.wipe) { $("bWipe").hidden = false; confirmButton("bWipe", "Erase your files?", conn.wipe); }

  // browsers only allow sound after a click
  $("bPower").onclick = () => { initAudio(); $("power").remove(); showKeyboard(); };
}
