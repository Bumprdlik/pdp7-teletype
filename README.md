# pdp7-teletype

A paper-roll **Teletype Model 33** in your browser, as the console for **PDP-7 Unix v0**
(the first Unix, from 1969, resurrected by the [pdp7-unix](https://github.com/DoctorWkt/pdp7-unix) project).

Instead of a terminal window, output is typed onto a roll of paper: upper case only,
72 characters per line, **20 characters per second** (a real Model 33 does 10), uneven strikes, ink bleed, a paper bail,
a moving type cylinder and machine sounds.

**▶ Try it online: <https://bumprdlik.github.io/pdp7-teletype/>**. It runs entirely in your
browser, on desktop or phone, with nothing to install. Log in as `ken` / `ken`.

## How it works

```
browser (app/)  <->  teletype.py (HTTP + SSE, 127.0.0.1:8033)  <->  SIMH pdp7 (telnet console)
```

`teletype.py` starts the SIMH simulator with its console on telnet, connects to it and streams
the output to the page. It uses only the Python standard library and listens on `127.0.0.1` only.

The page is plain HTML, CSS and JavaScript modules, with no build step and no dependencies:

| `app/` | |
|---|---|
| `index.html`, `style.css` | the page |
| `js/main.js` | wires the modules together |
| `js/paper.js`, `js/render.js` | the printed paper and drawing it on the canvas |
| `js/printer.js` | the print loop: 20 characters per second, Turbo |
| `js/layout.js` | fitting the paper to the window, panning it on phones |
| `js/keyboard.js`, `js/gestures.js` | typing (also with phone keyboards), wheel and touch |
| `js/sound.js` | synthesized machine sounds, or your own samples |
| `js/transport.js` | the connection to the PDP-7: `teletype.py`, or a Web Worker in the browser-only build |
| `js/manual.js`, `js/ui.js` | the manual panel, the buttons and the menu |
| `js/config.js` | server or browser-only build (`web/build.sh` writes its own copy) |

## Quick start

```sh
git clone https://github.com/Bumprdlik/pdp7-teletype.git
cd pdp7-teletype
./setup.sh             # fetches and builds Open SIMH (pdp7) and pdp7-unix into ./deps
python3 teletype.py
```

`setup.sh` needs `git`, `make`, a C compiler and Perl with the `DateTime` module; it tells you
how to install whatever is missing. Running it again only builds what is missing
(`--rebuild` forces a rebuild).

## Requirements

- Python 3
- the PDP-7 simulator from [Open SIMH](https://github.com/open-simh/simh)
- a built [pdp7-unix](https://github.com/DoctorWkt/pdp7-unix)

`setup.sh` takes care of both. If you build them yourself: SIMH with `make OPTIMIZE=-O1 pdp7`,
pdp7-unix with `make CCARGS="-std=gnu89 -Wno-multichar -Wno-implicit"` (its B compiler is K&R C,
which GCC 15+ rejects otherwise).

`teletype.py` looks for them in `./deps`. Other locations can be set with environment variables:

```sh
SIMH_PDP7=/path/to/pdp7 PDP7_UNIX_BUILD=/path/to/pdp7-unix/build python3 teletype.py
```

## Running

```sh
python3 teletype.py            # opens http://127.0.0.1:8033
python3 teletype.py --no-browser
```

Click **POWER ON TELETYPE** (browsers only allow sound after a click) and log in as `ken` / `ken`
(other accounts: `dmr`, `doug`; the password equals the name).

On first start a private copy of the disk is created in `disk/`, so the original `image.fs`
stays untouched. The disk is saved on exit (`Ctrl+C`).

| Control | |
|---|---|
| F5 / **Turbo** | fast printing |
| F7 / **Lid** | quieter machine |
| F8 | cycle carriage-return sounds (only with your own samples) |
| F2 / **Manual** | Unix v0 manual in a side panel, with search |
| mouse wheel, End | scroll back through the paper, return to the print line |
| **Tear off paper** | start with a clean sheet |
| **Restart computer** | power-cycle the PDP-7 (when Unix hangs) |
| Backspace | sends `#`, which erases the previous character in v0 |

## Unix v0 tips

- `ch dir` instead of `cd`; `ch dd` goes to the root directory; `..` means *this* directory
- programs live in the `system` directory; commands only work in a directory you can write to
- `ed` is the only editor; `b` (the B language) and `as` can build `hello.b` in `dmr`'s directory
- do not run `n.out` - it is a symbol table, not a program, and it hangs the whole machine

## Browser-only version (no server)

`web/build.sh` compiles the SIMH PDP-7 simulator to WebAssembly with
[Emscripten](https://emscripten.org) and puts it, together with the Unix v0 disk, into a
static site in `web/dist`. Anyone can then use it from any static web host such as GitHub Pages:

```sh
./setup.sh                                   # SIMH and pdp7-unix sources + disk image
web/build.sh                                 # uses a local emcc, or the emscripten/emsdk Docker image
python3 -m http.server -d web/dist 8034      # try it at http://127.0.0.1:8034
```

- The simulator runs in a Web Worker in each visitor's browser. Every visitor has their own
  PDP-7, so there is nothing to secure on the server.
- The disk is saved to the browser's IndexedDB every few seconds. **Factory disk** goes back to
  the original disk.
- The CPU is throttled to about 1 million instructions per second (roughly twice the real PDP-7),
  so an idle machine barely uses any CPU.
- The browser changes to SIMH are small: a console and sleep backend for Emscripten
  (`web/simh-emscripten.patch`) plus `web/web_glue.c`.
- `.github/workflows/pages.yml` builds and deploys it on every push to `main` once Pages is set to
  "GitHub Actions" in the repository settings.

## Tests

`tests/regress.mjs` drives the page in a headless Brave/Chromium (muted, throw-away profile) and
checks the desktop and phone layouts (portrait and landscape, with and without the on-screen
keyboard), typing, the manual, the menu and the saved disk. It needs Node 22+ and no npm packages.

```sh
web/build.sh && node tests/regress.mjs          # the static build
node tests/regress.mjs --server                 # plus teletype.py (in a temporary disk directory)
node tests/regress.mjs --only phone --keep      # a subset, with screenshots in tests/out/
node tests/regress.mjs --url https://bumprdlik.github.io/pdp7-teletype/   # the deployed site
```

The tests only use the DOM and `window.__teletype` (what was printed, plus a little layout state),
so they keep working when the page's code is reorganized.

## Manual

The **Manual** panel shows the man pages shipped with pdp7-unix (`man/` next to its `build/`
directory, override with `PDP7_UNIX_MAN`) plus a short "v0 tips" page, a B language page and an `ed` guide
(after [An introduction to the UNIX ed line editor](https://gunkies.org/wiki/An_introduction_to_the_UNIX_ed_line_editor),
Computer History Wiki, GFDL 1.2, cut down to what v0 `ed` can do). The search box filters
pages by name and content and highlights the matches.

## Sounds

Machine sounds are synthesized in the browser. If you put your own recordings into `sounds/`
(`strike_*.wav` for strikes, `cr_*.wav` for the carriage return, `motor.wav` for a motor loop),
they are used instead. Recordings are not part of this repository.

## License

This project's code: [GPL-3.0-or-later](LICENSE).
PDP-7 Unix and SIMH are not included and have their own licenses: pdp7-unix is GPLv3, but the original 1970 Unix code it contains is © Micro Focus, according to its README. SIMH uses an MIT-style license.
