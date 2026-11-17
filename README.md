# pdp7-teletype

A paper-roll **Teletype Model 33** in your browser, as the console for **PDP-7 Unix v0**
(the first Unix, from 1969, resurrected by the [pdp7-unix](https://github.com/DoctorWkt/pdp7-unix) project).

Instead of a terminal window, output is typed onto a roll of paper: upper case only,
72 characters per line, **10 characters per second**, uneven strikes, ink bleed, a paper bail,
a moving type cylinder and machine sounds.

## How it works

```
browser (index.html)  <->  teletype.py (HTTP + SSE, 127.0.0.1:8033)  <->  SIMH pdp7 (telnet console)
```

`teletype.py` starts the SIMH simulator with its console on telnet, connects to it and streams
the output to the page. It uses only the Python standard library and listens on `127.0.0.1` only.

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

## Manual

The **Manual** panel shows the man pages shipped with pdp7-unix (`man/` next to its `build/`
directory, override with `PDP7_UNIX_MAN`) plus a short "v0 tips" page. The search box filters
pages by name and content and highlights the matches.

## Sounds

Machine sounds are synthesized in the browser. If you put your own recordings into `sounds/`
(`strike_*.wav` for strikes, `cr_*.wav` for the carriage return, `motor.wav` for a motor loop),
they are used instead. Recordings are not part of this repository.

## License

This project's code: [GPL-3.0-or-later](LICENSE).
PDP-7 Unix and SIMH are not included and have their own licenses: pdp7-unix is GPLv3, but the original 1970 Unix code it contains is © Micro Focus, according to its README. SIMH uses an MIT-style license.
