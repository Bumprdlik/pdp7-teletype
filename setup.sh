#!/usr/bin/env bash
# Fetch and build the PDP-7 simulator (Open SIMH) and PDP-7 Unix v0 into ./deps,
# where teletype.py finds them automatically.
#
#   ./setup.sh            # clone + build what is missing
#   ./setup.sh --rebuild  # build again even if the results exist
#
# Overrides: DEPS (target directory), SIMH_REPO, PDP7_UNIX_REPO (clone sources).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPS="${DEPS:-$HERE/deps}"
SIMH_REPO="${SIMH_REPO:-https://github.com/open-simh/simh.git}"
PDP7_UNIX_REPO="${PDP7_UNIX_REPO:-https://github.com/DoctorWkt/pdp7-unix.git}"
REBUILD=0
[[ "${1:-}" == "--rebuild" ]] && REBUILD=1

say()  { printf '\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\033[31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# --- prerequisites ------------------------------------------------------------
missing=()
for tool in git make perl; do command -v "$tool" >/dev/null || missing+=("$tool"); done
command -v cc >/dev/null || command -v gcc >/dev/null || command -v clang >/dev/null || missing+=("C compiler")
perl -MDateTime -e 1 2>/dev/null || missing+=("Perl module DateTime")
if ((${#missing[@]})); then
    printf 'Missing: %s\n\n' "${missing[*]}" >&2
    cat >&2 <<'EOF'
Install them with your package manager, for example:
  Arch:          sudo pacman -S --needed git base-devel perl-datetime
  Debian/Ubuntu: sudo apt install git build-essential libdatetime-perl
  Fedora:        sudo dnf install git make gcc perl-DateTime
  macOS:         xcode-select --install && cpan DateTime
EOF
    exit 1
fi

mkdir -p "$DEPS"
JOBS="$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 2)"

# --- Open SIMH: only the PDP-7 simulator ----------------------------------------
SIMH_DIR="$DEPS/simh"
if [[ ! -d "$SIMH_DIR/.git" ]]; then
    say "cloning Open SIMH"
    git clone --depth 1 "$SIMH_REPO" "$SIMH_DIR"
fi
if [[ $REBUILD == 1 || ! -x "$SIMH_DIR/BIN/pdp7" ]]; then
    say "building the PDP-7 simulator (this takes a minute)"
    # pdp7-unix recommends -O1 on 64-bit systems
    make -C "$SIMH_DIR" -j"$JOBS" OPTIMIZE=-O1 pdp7
fi
[[ -x "$SIMH_DIR/BIN/pdp7" ]] || fail "SIMH build did not produce BIN/pdp7"

# --- PDP-7 Unix v0 ----------------------------------------------------------------
UNIX_DIR="$DEPS/pdp7-unix"
if [[ ! -d "$UNIX_DIR/.git" ]]; then
    say "cloning pdp7-unix"
    git clone "$PDP7_UNIX_REPO" "$UNIX_DIR"
fi
if [[ $REBUILD == 1 || ! -f "$UNIX_DIR/build/image.fs" ]]; then
    say "building Unix v0 (kernel, commands, disk image)"
    # tools/b.c is K&R C; newer compilers (GCC 15+, C23) reject it without gnu89
    make -C "$UNIX_DIR" CCARGS="-std=gnu89 -Wno-multichar -Wno-implicit"
fi
for f in image.fs boot.rim; do
    [[ -f "$UNIX_DIR/build/$f" ]] || fail "pdp7-unix build did not produce build/$f"
done

say "done - start the teletype with:  python3 teletype.py"
