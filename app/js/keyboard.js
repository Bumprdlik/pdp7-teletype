// Typing: the physical keyboard (keydown) and phone on-screen keyboards (a hidden text field).
//
// Phone keyboards usually send no usable keydown (key "Unidentified"), only text changes of the
// focused field. So the hidden field's text is compared with its previous text: added characters
// are typed, removed ones become # (v0's erase). Outside of IME composition the field is reset to
// a short placeholder, so Backspace always has something to delete.
import { $ } from "./util.js";

const kbd = $("kbd"), KBD_FILL = "  ";
let kbdPrev = KBD_FILL, keySentAt = -1e9;

export const keyboardOpen = () => document.activeElement === kbd;
export function showKeyboard() { if (!document.body.classList.contains("manopen")) kbd.focus({ preventScroll: true }); }
export const hideKeyboard = () => kbd.blur();

// send(text): to the PDP-7; onTyped(): something was typed (return to the print line);
// shortcut(e): page shortcuts (F-keys, scrolling) - returns true when it handled the key
export function initKeyboard({ send, onTyped, shortcut }) {
  window.addEventListener("keydown", (e) => {
    if (shortcut(e)) return;
    if (e.metaKey || e.altKey) return;
    let s = null;
    if (e.ctrlKey && e.key.length === 1) s = String.fromCharCode(e.key.toUpperCase().charCodeAt(0) & 0x1f);
    else if (e.key === "Enter") s = "\r";
    else if (e.key === "Backspace") s = "#";      // v0: # erases the previous character
    else if (e.key === "Tab") s = "\t";
    else if (e.key === "Escape") s = "\x1b";
    else if (e.key.length === 1) s = e.key.toLowerCase();
    if (s !== null) { e.preventDefault(); onTyped(); send(s); keySentAt = performance.now(); }
  });

  const kbdReset = () => { kbd.value = kbdPrev = KBD_FILL; kbd.setSelectionRange(KBD_FILL.length, KBD_FILL.length); };
  kbd.addEventListener("input", (e) => {
    const now = kbd.value;
    if (performance.now() - keySentAt > 80) {        // not already sent by the keydown handler
      let p = 0;
      while (p < now.length && p < kbdPrev.length && now[p] === kbdPrev[p]) p++;
      let s = "#".repeat(kbdPrev.length - p);
      for (const ch of now.slice(p)) s += ch === "\n" ? "\r" : ch.toLowerCase();
      if (s) { onTyped(); send(s); }
    }
    kbdPrev = now;
    if (!e.isComposing) kbdReset();
  });
  kbd.addEventListener("compositionend", kbdReset);
  kbd.addEventListener("focus", kbdReset);
}

// call fn(open) whenever the on-screen keyboard opens or closes
export function onKeyboardChange(fn) {
  kbd.addEventListener("focus", () => fn(true));
  kbd.addEventListener("blur", () => fn(false));
}
