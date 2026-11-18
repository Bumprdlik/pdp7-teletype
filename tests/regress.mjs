#!/usr/bin/env node
// Regression tests for the teletype page, driven in a headless Chromium-family browser over the
// Chrome DevTools Protocol. No npm packages: Node 22+ (built-in fetch and WebSocket).
//
//   web/build.sh && node tests/regress.mjs            # static (WebAssembly) build in web/dist
//   node tests/regress.mjs --server                    # also test teletype.py (needs ./setup.sh)
//   node tests/regress.mjs --only phone                # tests whose name contains "phone"
//   BROWSER=/usr/bin/chromium node tests/regress.mjs   # pick the browser (default: brave/chromium/chrome)
//   node tests/regress.mjs --keep                      # keep screenshots in tests/out/
//   node tests/regress.mjs --url https://bumprdlik.github.io/pdp7-teletype/   # test a deployed site
//
// The tests only use the DOM and the read-only window.__teletype view, so they keep working when
// the page's code is reorganized.
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "web", "dist");
const args = process.argv.slice(2);
const opt = (name) => args.includes(name);
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const URL_ARG = args.includes("--url") ? args[args.indexOf("--url") + 1] : null;
const OUT = join(ROOT, "tests", "out");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- static file server for web/dist ----------
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm", ".gz": "application/gzip",
  ".txt": "text/plain; charset=utf-8" };
function serveDist() {
  return new Promise((ok) => {
    const srv = createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const f = normalize(join(DIST, p));
      if (!f.startsWith(DIST) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
      res.end(readFileSync(f));
    });
    srv.listen(0, "127.0.0.1", () => ok(srv));
  });
}

// ---------- browser ----------
function findBrowser() {
  if (process.env.BROWSER) return process.env.BROWSER;
  for (const b of ["brave", "brave-browser", "chromium", "chromium-browser", "google-chrome-stable", "google-chrome"]) {
    try { return execFileSync("which", [b], { encoding: "utf8" }).trim(); } catch {}
  }
  throw new Error("no Chromium-family browser found - set BROWSER=/path/to/browser");
}
async function launchBrowser() {
  const profile = mkdtempSync(join(tmpdir(), "teletype-test-"));
  const proc = spawn(findBrowser(), ["--headless=new", "--mute-audio", "--no-first-run", "--no-default-browser-check",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  if (!existsSync(portFile)) throw new Error("the browser did not start");
  const port = readFileSync(portFile, "utf8").split("\n")[0];
  return { port, close() { proc.kill(); setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500); } };
}

// ---------- one page = one CDP session ----------
class Page {
  static async open(browser, url) {
    const t = await (await fetch(`http://127.0.0.1:${browser.port}/json/new?about:blank`, { method: "PUT" })).json();
    const p = new Page(browser, t);
    await p.connect();
    await p.cmd("Runtime.enable");
    await p.cmd("Page.enable");
    if (url) await p.goto(url);
    return p;
  }
  constructor(browser, target) { this.browser = browser; this.target = target; this.id = 0; this.waiting = {}; this.errors = []; }
  connect() {
    this.ws = new WebSocket(this.target.webSocketDebuggerUrl);
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.waiting[m.id]) { this.waiting[m.id](m); delete this.waiting[m.id]; }
      if (m.method === "Runtime.exceptionThrown") this.errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    };
    return new Promise((ok) => (this.ws.onopen = ok));
  }
  cmd(method, params = {}) {
    return new Promise((ok, fail) => {
      const id = ++this.id;
      this.waiting[id] = (m) => (m.error ? fail(new Error(`${method}: ${m.error.message}`)) : ok(m.result));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expr) {
    const r = await this.cmd("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("eval failed: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async goto(url) {
    await this.cmd("Page.navigate", { url });
    await this.until("document.readyState === 'complete' && !!window.__teletype", 10000, "page load");
  }
  async reload() { await this.cmd("Page.reload"); await sleep(300); await this.until("document.readyState === 'complete' && !!window.__teletype", 10000, "reload"); }
  async until(expr, ms = 15000, what = expr) {
    const t = Date.now();
    while (Date.now() - t < ms) { if (await this.eval(expr).catch(() => false)) return; await sleep(100); }
    throw new Error(`timed out waiting for ${what}`);
  }
  state() { return this.eval("window.__teletype.state"); }
  printed() { return this.eval("window.__teletype.printed"); }
  async mark() { return (await this.printed()).length; }
  // wait until text matching re was printed after position `since` (from mark())
  async waitFor(re, since = 0, ms = 20000) {
    const t = Date.now();
    while (Date.now() - t < ms) {
      const p = (await this.printed()).slice(since);
      if (re.test(p)) return p;
      await sleep(150);
    }
    throw new Error(`timed out waiting for ${re} - printed: ${JSON.stringify((await this.printed()).slice(since).slice(-300))}`);
  }
  // desktop keyboard: real keydown events
  async type(text) {
    for (const ch of text) {
      const key = ch === "\r" ? "Enter" : ch;
      await this.cmd("Input.dispatchKeyEvent", { type: "keyDown", key, text: ch, windowsVirtualKeyCode: ch === "\r" ? 13 : 0 });
      await this.cmd("Input.dispatchKeyEvent", { type: "keyUp", key });
      await sleep(25);
    }
  }
  async key(key, code = 0) {
    await this.cmd("Input.dispatchKeyEvent", { type: "keyDown", key, windowsVirtualKeyCode: code });
    await this.cmd("Input.dispatchKeyEvent", { type: "keyUp", key, windowsVirtualKeyCode: code });
  }
  // phone keyboard: text arrives as changes of the focused field, without keydown
  async insert(text) { for (const ch of text) { await this.cmd("Input.insertText", { text: ch }); await sleep(30); } }
  // centre of an element, once it has stopped moving (panels slide in with a CSS transition)
  async center(sel) {
    const pos = () => this.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null;
      const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2, b.width > 0 && b.height > 0]; })()`);
    let r = await pos();
    for (let i = 0; i < 20; i++) {
      await sleep(60);
      const n = await pos();
      if (r && n && n[0] === r[0] && n[1] === r[1]) break;
      r = n;
    }
    if (!r || !r[2]) throw new Error(`${sel} is not visible`);
    return r;
  }
  // a rectangle once it has stopped moving
  async rect(sel) {
    await this.center(sel);
    return this.eval(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; })()`);
  }
  async click(sel) {
    const [x, y] = await this.center(sel);
    for (const type of ["mousePressed", "mouseReleased"]) await this.cmd("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
    await sleep(150);
  }
  async tap(sel) {
    const [x, y] = await this.center(sel);
    await this.cmd("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await this.cmd("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(250);
  }
  async swipe(x0, y0, x1, y1, steps = 8) {
    await this.cmd("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= steps; i++)
      await this.cmd("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }] });
    await this.cmd("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(250);
  }
  async desktop(w = 1400, h = 900) {
    await this.cmd("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await this.cmd("Emulation.setTouchEmulationEnabled", { enabled: false });
    await this.cmd("Emulation.setEmulatedMedia", { features: [] });
  }
  // a Pixel 8: [w, h] is the window (the keyboard makes it smaller), the screen orientation is separate
  async phone(w, h, portrait = h > w) {
    await this.cmd("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2.625, mobile: true,
      screenWidth: portrait ? 412 : 915, screenHeight: portrait ? 915 : 412,
      screenOrientation: portrait ? { type: "portraitPrimary", angle: 0 } : { type: "landscapePrimary", angle: 90 } });
    await this.cmd("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await this.cmd("Emulation.setEmulatedMedia", { features: [{ name: "pointer", value: "coarse" }] });
    await sleep(300);
  }
  async screenshot(name) {
    if (!opt("--keep")) return;
    mkdirSync(OUT, { recursive: true });
    const r = await this.cmd("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, name + ".png"), Buffer.from(r.data, "base64"));
  }
  async clearStorage(origin) {
    await this.cmd("Storage.clearDataForOrigin", { origin, storageTypes: "local_storage,indexeddb" });
  }
  async close() {
    try { this.ws.close(); } catch {}
    await fetch(`http://127.0.0.1:${this.browser.port}/json/close/${this.target.id}`).catch(() => {});
  }
}

// ---------- assertions ----------
function assert(cond, msg) { if (!cond) throw new Error("assertion failed: " + msg); }
function near(a, b, eps, msg) { assert(Math.abs(a - b) <= eps, `${msg}: ${a} is not ~${b}`); }

// ---------- shared steps ----------
async function powerOn(p, { touch = false } = {}) {
  await (touch ? p.tap("#bPower") : p.click("#bPower"));
  const s = await p.state();
  if (!s.turbo) await p.key("F5", 116);             // print fast, the tests don't need 20 chars/s
  assert((await p.state()).turbo, "F5 switches turbo on");
}
async function login(p, how = "type") {               // how: "type" (desktop keys) or "insert" (phone)
  const enter = how === "insert" ? "\n" : "\r";
  await p.waitFor(/login: ?$/, 0, 25000);
  let m = await p.mark();
  await p[how]("ken" + enter);
  await p.waitFor(/password: ?$/, m);
  m = await p.mark();
  await p[how]("ken" + enter);
  await p.waitFor(/@ ?$/, m);
}
async function run(p, how, cmd, expect) {
  const m = await p.mark();
  await p[how](cmd + (how === "insert" ? "\n" : "\r"));
  return p.waitFor(expect, m);
}

// ---------- tests ----------
const tests = [];
const test = (name, fn, { server = false } = {}) => tests.push({ name, fn, server });

test("desktop: boot, login, ls, layout", async ({ page }) => {
  await page.desktop();
  await page.reload();
  const s = await page.state();
  assert(s.staticBuild === true, "static build");
  near(s.scale, 1, 0.001, "desktop scale");
  assert(!s.pan && !s.short && !s.side, "no pan/short/side on desktop");
  for (const id of ["bTurbo", "bLid", "bTear", "bMan", "bReset", "bWipe"])
    assert(await page.eval(`getComputedStyle(document.getElementById("${id}")).display !== "none"`), `${id} visible on desktop`);
  for (const id of ["bMenu", "bKbd", "bEsc"])
    assert(await page.eval(`getComputedStyle(document.getElementById("${id}")).display === "none"`), `${id} hidden on desktop`);
  await powerOn(page);
  await login(page);
  await run(page, "type", "ls", /system/);
  await page.screenshot("desktop");
});

test("desktop: Backspace sends #, Ctrl+E is ignored", async ({ page }) => {
  await page.desktop();
  await page.reload();
  await powerOn(page);
  await login(page);
  const m = await page.mark();
  await page.type("lx");
  await page.key("Backspace", 8);
  await page.type("s\r");
  const out = await page.waitFor(/system/, m);
  assert(out.includes("lx#s"), "Backspace printed as #: " + JSON.stringify(out.slice(0, 20)));
  await page.cmd("Input.dispatchKeyEvent", { type: "keyDown", key: "e", modifiers: 2, windowsVirtualKeyCode: 69 });
  await page.cmd("Input.dispatchKeyEvent", { type: "keyUp", key: "e", modifiers: 2, windowsVirtualKeyCode: 69 });
  await sleep(500);
  await run(page, "type", "ls", /system/);           // SIMH did not stop
});

test("desktop: manual opens, searches, closes", async ({ page }) => {
  await page.desktop();
  await page.reload();
  await powerOn(page);
  await page.key("F2", 113);
  await page.until("window.__teletype.state.manual", 3000, "manual open");
  await page.until("document.querySelectorAll('#manList button').length > 5", 5000, "manual pages listed");
  const all = await page.eval("document.querySelectorAll('#manList button').length");
  await page.eval(`(() => { const q = document.getElementById("manQ"); q.value = "chmod"; q.dispatchEvent(new Event("input")); })()`);
  const some = await page.eval("document.querySelectorAll('#manList button').length");
  assert(some > 0 && some < all, `search filters the pages (${some} of ${all})`);
  assert(await page.eval("document.querySelectorAll('#manPage mark').length > 0"), "matches are highlighted");
  await page.key("Escape", 27);
  await page.until("!window.__teletype.state.manual", 3000, "manual closed");
});

test("desktop: wheel scrollback, End, Lid, Tear off paper", async ({ page }) => {
  await page.desktop();
  await page.reload();
  await powerOn(page);
  await login(page);
  await run(page, "type", "ls", /system/);
  const backShown = () => page.eval(`getComputedStyle(document.getElementById("back")).display !== "none"`);
  assert(!(await backShown()), "not scrolled back at first");
  await page.cmd("Input.dispatchMouseEvent", { type: "mouseWheel", x: 700, y: 500, deltaX: 0, deltaY: -400 });
  await sleep(200);
  assert(await backShown(), "wheel up scrolls back");
  await page.key("End", 35);
  await sleep(200);
  assert(!(await backShown()), "End returns to the print line");
  await page.key("F7", 118);
  assert((await page.state()).lid && await page.eval(`document.getElementById("bLid").classList.contains("on")`), "F7 closes the lid");
  await page.click("#bLid");
  assert(!(await page.state()).lid, "the Lid button opens it again");
  assert((await page.state()).line > 10, "many lines printed");
  // the "@ " prompt may still be arriving after ls: wait until it is printed and the head stands still
  await page.until(`window.__teletype.printed.endsWith("@ ") && window.__teletype.state.queued === 0`, 5000, "prompt printed");
  const col = (await page.state()).col;
  await page.click("#bTear");
  const s = await page.state();
  assert(s.line === 0 && s.col === col, `tearing off starts a clean sheet, the head stays (line ${s.line}, col ${s.col}/${col})`);
  await run(page, "type", "ls", /system/);
});

test("disk: saved across reload, kept by restart, erased by factory disk", async ({ page, origin }) => {
  await page.desktop();
  await page.reload();
  await powerOn(page);
  await login(page);
  for (const line of ["ed", "a", "regression ok", ".", "w regfile", "q"]) { await page.type(line + "\r"); await sleep(400); }
  await run(page, "type", "cat regfile", /regression ok\s*\r?\n?@/);
  await sleep(6500);                                 // the worker saves the disk every 5 s
  await page.reload();
  await powerOn(page);
  await login(page);
  await run(page, "type", "cat regfile", /regression ok/);
  let m = await page.mark();
  await page.click("#bReset"); await page.click("#bReset");      // first click only asks
  await page.waitFor(/COMPUTER RESTART/, m);
  await login(page);
  await run(page, "type", "cat regfile", /regression ok/);
  m = await page.mark();
  await page.click("#bWipe"); await page.click("#bWipe");
  await page.waitFor(/NEW DISK/, m);
  await login(page);
  await run(page, "type", "cat regfile", /regfile +\?/);
});

test("phone portrait: keyboard field, toggle, menu, manual", async ({ page }) => {
  await page.phone(412, 915);
  await page.reload();
  let s = await page.state();
  assert(!s.side, "bar on top in portrait");
  near(s.scale, 0.7, 0.001, "portrait type scale");
  assert(s.pan, "paper pans in portrait");
  await powerOn(page, { touch: true });
  assert((await page.state()).keyboard, "power on opens the keyboard");
  await login(page, "insert");
  await run(page, "insert", "ls", /system/);
  await page.tap("#bKbd");
  assert(!(await page.state()).keyboard, "Keyboard button hides the keyboard");
  await page.tap("#bKbd");
  assert((await page.state()).keyboard, "Keyboard button shows the keyboard");
  await page.tap("#bMenu");
  s = await page.state();
  assert(s.menu && s.keyboard, "menu opens and the keyboard stays");
  assert(await page.eval(`(() => { const r = document.getElementById("bTurbo").getBoundingClientRect(); return r.width > 0 && r.top > 40; })()`), "menu items below the bar");
  await page.tap("#bMan");
  s = await page.state();
  assert(s.manual && !s.keyboard && !s.menu, "manual closes the menu and hides the keyboard");
  await page.tap("#manClose");
  s = await page.state();
  assert(!s.manual && s.keyboard, "closing the manual brings the keyboard back");
  await page.screenshot("phone-portrait");
});

test("phone portrait: backspace and autocorrect-style edits become #", async ({ page }) => {
  await page.phone(412, 915);
  await page.reload();
  await powerOn(page, { touch: true });
  await login(page, "insert");
  const m = await page.mark();
  await page.insert("lx");
  await page.key("Backspace", 8);                    // keydown path (Gboard sends this)
  await page.insert("s\n");
  const out = await page.waitFor(/system/, m);
  assert(out.includes("lx#s"), "backspace printed as #: " + JSON.stringify(out.slice(0, 20)));
});

test("phone portrait: type size A-/A+ is remembered", async ({ page, origin }) => {
  await page.clearStorage(origin);
  await page.phone(412, 915);
  await page.reload();
  near((await page.state()).scale, 0.7, 0.001, "default portrait scale");
  await powerOn(page, { touch: true });
  await page.tap("#bMenu");
  await page.tap("#bLarger");
  near((await page.state()).scale, 0.8, 0.001, "A+ makes it larger");
  await page.reload();
  near((await page.state()).scale, 0.8, 0.001, "scale remembered after reload");
  await powerOn(page, { touch: true });
  await page.tap("#bMenu");
  await page.tap("#bSmaller");
  near((await page.state()).scale, 0.7, 0.001, "A- makes it smaller");
});

test("phone portrait: paper pans after the head, swipes pan and scroll", async ({ page }) => {
  await page.phone(412, 915);
  await page.reload();
  await powerOn(page, { touch: true });
  await login(page, "insert");
  await page.insert("echo the quick brown fox jumps over the lazy dog and keeps running far");
  await page.until("window.__teletype.state.queued === 0 && window.__teletype.state.panX > 100", 10000, "pan after the head");
  const m = await page.mark();
  await page.insert("\n");
  await page.waitFor(/@ ?$/, m);
  await page.until("window.__teletype.state.panX < 20", 5000, "pan back after carriage return");
  await page.swipe(300, 600, 80, 600);               // drag left = look further right
  assert((await page.state()).panX > 50, "horizontal swipe pans the paper");
  await page.swipe(200, 400, 200, 700);              // drag down = older text
  assert(await page.eval(`getComputedStyle(document.getElementById("back")).display !== "none"`), "vertical swipe scrolls back");
});

test("phone portrait with keyboard open: bar stays on top, type stays large", async ({ page }) => {
  await page.phone(412, 915);
  await page.reload();
  await powerOn(page, { touch: true });
  await page.phone(412, 380, true);                  // keyboard open: the window is now wider than tall
  await page.until("!window.__teletype.state.side", 2000, "no side bar");
  const s = await page.state();
  near(s.scale, 0.7, 0.001, "type scale with keyboard");
  assert(await page.eval(`document.getElementById("bar").getBoundingClientRect().width > 300`), "bar spans the top");
  await page.screenshot("phone-portrait-keyboard");
});

test("phone landscape: side bar, manual next to it", async ({ page }) => {
  await page.phone(915, 412);
  await page.reload();
  let s = await page.state();
  assert(s.side && !s.pan && !s.short, "side bar, no pan, not short");
  const bar = await page.eval(`(() => { const r = document.getElementById("bar").getBoundingClientRect(); return [r.width, r.height]; })()`);
  assert(bar[0] < 140 && bar[1] > 300, "bar is a column: " + bar);
  assert(await page.eval(`document.getElementById("man").getBoundingClientRect().right <= 1`), "closed manual is off screen");
  await powerOn(page, { touch: true });
  await page.tap("#bMenu");
  assert(await page.eval(`document.getElementById("more").getBoundingClientRect().left >= document.getElementById("bar").getBoundingClientRect().right - 1`), "menu opens beside the bar");
  await page.tap("#bMan");
  const man = await page.rect("#man"), barR = await page.rect("#bar");
  assert(man.left >= barR.right - 1, `open manual is beside the bar (${man.left} vs ${barR.right})`);
  await page.tap("#manClose");
  await page.screenshot("phone-landscape");
});

test("phone landscape with keyboard open: short view without the head", async ({ page }) => {
  await page.phone(915, 412);
  await page.reload();
  await powerOn(page, { touch: true });
  await login(page, "insert");
  await page.phone(915, 190, false);
  await page.until("window.__teletype.state.short", 2000, "short mode");
  const s = await page.state();
  assert(s.side, "still a side bar");
  await run(page, "insert", "ls", /system/);
  await page.screenshot("phone-landscape-keyboard");
});

test("server mode (teletype.py): boot, login, ls", async ({ browser }) => {
  const disk = mkdtempSync(join(tmpdir(), "teletype-disk-"));
  const port = 18000 + Math.floor(Math.random() * 1000);
  const py = spawn("python3", [join(ROOT, "teletype.py"), "--no-browser"],
    { env: { ...process.env, TELETYPE_DISK: disk, TELETYPE_PORT: String(port) }, stdio: "ignore" });
  try {
    let page;
    for (let i = 0; i < 50 && !page; i++) { try { await fetch(`http://127.0.0.1:${port}/`); page = await Page.open(browser, `http://127.0.0.1:${port}/`); } catch { await sleep(200); } }
    assert(page, "teletype.py did not start");
    try {
      await page.desktop();
      assert((await page.state()).staticBuild === false, "server build");
      await powerOn(page);
      await page.type("\r");                          // the console may already have printed login: before we connected
      await login(page);
      await run(page, "type", "ls", /system/);
      assert(page.errors.length === 0, "no page errors: " + page.errors.join("; "));
    } finally { await page.close(); }
  } finally {
    py.kill("SIGTERM");
    await new Promise((r) => py.on("exit", r));
    rmSync(disk, { recursive: true, force: true });
  }
}, { server: true });

// ---------- runner ----------
const selected = tests.filter((t) => (!t.server || opt("--server")) && (!ONLY || t.name.includes(ONLY)));
if (!URL_ARG && !existsSync(join(DIST, "index.html"))) { console.error("web/dist is missing - run web/build.sh first"); process.exit(2); }
const srv = URL_ARG ? null : await serveDist();
const site = URL_ARG ? URL_ARG.replace(/\/?$/, "/") : `http://127.0.0.1:${srv.address().port}/`;
const origin = new URL(site).origin;
const browser = await launchBrowser();
let failed = 0;
console.log(`${selected.length} tests, ${site}\n`);
for (const t of selected) {
  const t0 = Date.now();
  let page = null;
  try {
    if (!t.server) { page = await Page.open(browser, site); await page.clearStorage(origin); }
    await t.fn({ page, browser, origin });
    if (page) assert(page.errors.length === 0, "no page errors: " + page.errors.join("; "));
    console.log(`  \x1b[32mok\x1b[0m    ${t.name}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    failed++;
    console.log(`  \x1b[31mFAIL\x1b[0m  ${t.name}\n        ${e.message}`);
    if (page) await page.screenshot("FAIL-" + t.name.replace(/[^a-z0-9]+/gi, "-")).catch(() => {});
  } finally {
    if (page) await page.close();
  }
}
browser.close();
if (srv) srv.close();
console.log(`\n${selected.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
