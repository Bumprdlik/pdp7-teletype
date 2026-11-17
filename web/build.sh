#!/usr/bin/env bash
# Build the browser-only version: SIMH (pdp7) compiled to WebAssembly with Emscripten,
# plus the PDP-7 Unix disk, as a static site in web/dist (e.g. for GitHub Pages).
#
#   ./setup.sh          # first: fetches and builds SIMH and pdp7-unix into ./deps
#   web/build.sh        # then: builds web/dist
#   python3 -m http.server -d web/dist 8034    # try it at http://127.0.0.1:8034
#
# Uses a local `emcc` if there is one, otherwise the emscripten/emsdk Docker image.
# Overrides: SIMH_SRC, PDP7_UNIX (source trees), EMSDK_IMAGE.
set -euo pipefail

WEB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$WEB")"
SIMH_SRC="${SIMH_SRC:-$ROOT/deps/simh}"
PDP7_UNIX="${PDP7_UNIX:-$ROOT/deps/pdp7-unix}"
EMSDK_IMAGE="${EMSDK_IMAGE:-emscripten/emsdk:4.0.10}"
BUILD="$WEB/build"
DIST="$WEB/dist"

say()  { printf '\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f "$SIMH_SRC/scp.c" ]] || fail "SIMH sources not found in $SIMH_SRC - run ./setup.sh first"
[[ -f "$PDP7_UNIX/build/image.fs" ]] || fail "pdp7-unix disk not found in $PDP7_UNIX/build - run ./setup.sh first"

# --- patched copy of the SIMH sources ------------------------------------------
say "preparing SIMH sources"
rm -rf "$BUILD"; mkdir -p "$BUILD/simh"
cp "$SIMH_SRC"/*.c "$SIMH_SRC"/*.h "$BUILD/simh/"
cp -r "$SIMH_SRC/PDP18B" "$BUILD/simh/"
cp "$WEB/web_glue.c" "$BUILD/simh/"
patch -d "$BUILD/simh" -p1 --binary --quiet < "$WEB/simh-emscripten.patch" \
    || fail "simh-emscripten.patch does not apply to this SIMH version"

# --- compile -------------------------------------------------------------------
P=PDP18B
SRCS=(
    $P/pdp18b_dt.c $P/pdp18b_drm.c $P/pdp18b_cpu.c $P/pdp18b_lp.c $P/pdp18b_mt.c
    $P/pdp18b_rf.c $P/pdp18b_rp.c $P/pdp18b_stddev.c $P/pdp18b_sys.c $P/pdp18b_rb.c
    $P/pdp18b_tt1.c $P/pdp18b_fpp.c $P/pdp18b_g2tty.c $P/pdp18b_dr15.c
    scp.c sim_console.c sim_fio.c sim_timer.c sim_sock.c sim_tmxr.c sim_ether.c
    sim_tape.c sim_disk.c sim_serial.c sim_video.c sim_imd.c sim_card.c web_glue.c
)
FLAGS=(
    -O2 -DPDP7 -I$P -I.
    -sASYNCIFY -sASYNCIFY_STACK_SIZE=65536
    -sMODULARIZE -sEXPORT_NAME=createPDP7 -sENVIRONMENT=worker
    -sALLOW_MEMORY_GROWTH -sINVOKE_RUN=0 -sEXIT_RUNTIME=1
    -sEXPORTED_FUNCTIONS=_main,_web_disk_ptr,_web_disk_bytes
    -sEXPORTED_RUNTIME_METHODS=callMain,FS,HEAPU8
    -lm -Wno-everything
)
say "compiling SIMH to WebAssembly"
if command -v emcc >/dev/null; then
    (cd "$BUILD/simh" && emcc "${SRCS[@]}" "${FLAGS[@]}" -o pdp7.js)
elif command -v docker >/dev/null; then
    docker run --rm -u "$(id -u):$(id -g)" -v "$BUILD/simh:/src" -w /src "$EMSDK_IMAGE" \
        emcc "${SRCS[@]}" "${FLAGS[@]}" -o pdp7.js
else
    fail "neither emcc nor docker found - install Emscripten (https://emscripten.org) or Docker"
fi

# --- assemble the site ---------------------------------------------------------
say "assembling $DIST"
rm -rf "$DIST"; mkdir -p "$DIST"
cp "$BUILD/simh/pdp7.js" "$BUILD/simh/pdp7.wasm" "$WEB/pdp7-worker.js" "$DIST/"
BUILD_ID="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"   # shown in the ☰ menu
sed -e 's/^const STATIC_BUILD = false;/const STATIC_BUILD = true;/' \
    -e "s/^const BUILD = \"dev\";/const BUILD = \"$BUILD_ID\";/" "$ROOT/index.html" > "$DIST/index.html"
grep -q '^const STATIC_BUILD = true;' "$DIST/index.html" || fail "could not switch index.html to the static build"
gzip -9 -n -c "$PDP7_UNIX/build/image.fs" > "$DIST/image.fs.gz"
cp "$PDP7_UNIX/build/boot.rim" "$DIST/"
echo '[]' > "$DIST/sounds.json"                 # recorded samples are not published
python3 - "$PDP7_UNIX/man" "$DIST/man.json" <<'EOF'
import json, os, sys
d, out = sys.argv[1], sys.argv[2]
pages = []
if os.path.isdir(d):
    for f in sorted(os.listdir(d)):
        p = os.path.join(d, f)
        if os.path.isfile(p) and os.path.getsize(p) < 200_000:
            with open(p, encoding="latin-1") as fh:
                pages.append({"name": f, "text": fh.read()})
json.dump(pages, open(out, "w"))
EOF
cp "$ROOT/LICENSE" "$DIST/LICENSE.txt"
cp "$WEB/NOTICE.txt" "$DIST/NOTICE.txt"
touch "$DIST/.nojekyll"

say "done: $(du -sh "$DIST" | cut -f1) in $DIST"
echo "try it:  python3 -m http.server -d '$DIST' 8034   ->  http://127.0.0.1:8034"
