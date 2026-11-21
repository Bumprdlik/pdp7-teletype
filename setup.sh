#!/usr/bin/env bash
# Fetch and build the PDP-7 simulator (Open SIMH) and PDP-7 Unix v0 into ./deps,
# where teletype.py finds them automatically.
#
#   ./setup.sh            # clone + build what is missing
#   ./setup.sh --rebuild  # build again even if the results exist
#
# Both are pinned to a tested commit (SIMH_COMMIT, PDP7_UNIX_COMMIT below), so an upstream change
# cannot break the build or the deployed site unnoticed. To move to newer versions, change the
# hashes, run ./setup.sh and the tests (tests/regress.mjs), and commit.
#
# Overrides: DEPS (target directory), SIMH_REPO, PDP7_UNIX_REPO (clone sources),
# SIMH_COMMIT, PDP7_UNIX_COMMIT (a commit hash, or a branch name such as master).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPS="${DEPS:-$HERE/deps}"
SIMH_REPO="${SIMH_REPO:-https://github.com/open-simh/simh.git}"
PDP7_UNIX_REPO="${PDP7_UNIX_REPO:-https://github.com/DoctorWkt/pdp7-unix.git}"
SIMH_COMMIT="${SIMH_COMMIT:-87eb7d5e96f9ce0ee6ac183e20160e5c486b0712}"        # 2026-09-22
PDP7_UNIX_COMMIT="${PDP7_UNIX_COMMIT:-555eb30fc76b8fa29095d32eca9a43e9b1638288}"  # 2023-09-08
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

# fetch <dir> <repo> <commit>: make <dir> a checkout of exactly <commit> (only that commit is
# downloaded). Returns 0 when the checkout changed, so the caller knows it has to rebuild.
# (Called as `fetch ... && x=1`, where set -e does not apply, hence the explicit `|| fail`.)
fetch() {
    local dir="$1" repo="$2" commit="$3"
    if [[ ! -d "$dir/.git" ]]; then
        git init -q "$dir" && git -C "$dir" remote add origin "$repo" || fail "git init $dir failed"
    elif [[ "$(git -C "$dir" rev-parse HEAD 2>/dev/null)" == "$commit" ]]; then
        return 1
    fi
    say "fetching $(basename "$dir") $commit"
    git -C "$dir" fetch -q --depth 1 origin "$commit" || fail "cannot fetch $commit from $repo"
    # --force: the pdp7-unix build rewrites a tracked file (build/fs/b_readme)
    git -C "$dir" -c advice.detachedHead=false checkout -q --force FETCH_HEAD || fail "checkout of $commit failed"
}
JOBS="$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 2)"

# --- Open SIMH: only the PDP-7 simulator ----------------------------------------
SIMH_DIR="$DEPS/simh"
SIMH_NEW=0; fetch "$SIMH_DIR" "$SIMH_REPO" "$SIMH_COMMIT" && SIMH_NEW=1
if [[ $REBUILD == 1 || $SIMH_NEW == 1 || ! -x "$SIMH_DIR/BIN/pdp7" ]]; then
    say "building the PDP-7 simulator (this takes a minute)"
    # pdp7-unix recommends -O1 on 64-bit systems
    make -C "$SIMH_DIR" -j"$JOBS" OPTIMIZE=-O1 pdp7
fi
[[ -x "$SIMH_DIR/BIN/pdp7" ]] || fail "SIMH build did not produce BIN/pdp7"

# --- PDP-7 Unix v0 ----------------------------------------------------------------
UNIX_DIR="$DEPS/pdp7-unix"
UNIX_NEW=0; fetch "$UNIX_DIR" "$PDP7_UNIX_REPO" "$PDP7_UNIX_COMMIT" && UNIX_NEW=1
if [[ $REBUILD == 1 || $UNIX_NEW == 1 || ! -f "$UNIX_DIR/build/image.fs" ]]; then
    say "building Unix v0 (kernel, commands, disk image)"
    # tools/b.c is K&R C; newer compilers (GCC 15+, C23) reject it without gnu89
    make -C "$UNIX_DIR" CCARGS="-std=gnu89 -Wno-multichar -Wno-implicit"
fi
for f in image.fs boot.rim; do
    [[ -f "$UNIX_DIR/build/$f" ]] || fail "pdp7-unix build did not produce build/$f"
done

say "done - start the teletype with:  python3 teletype.py"
