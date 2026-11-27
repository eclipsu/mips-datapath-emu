#!/usr/bin/env bash
# Builds web/src/wasm/mipscore.{mjs,wasm,d.mts}. Uses em++ from PATH or $EMSDK (default ~/emsdk).
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
out="$root/web/src/wasm"

if ! command -v em++ > /dev/null; then
    emsdk_dir="${EMSDK:-$HOME/emsdk}"
    if [[ ! -f "$emsdk_dir/emsdk_env.sh" ]]; then
        echo "em++ not found. Install emsdk or set EMSDK to its folder." >&2
        exit 1
    fi
    # shellcheck disable=SC1091
    source "$emsdk_dir/emsdk_env.sh" > /dev/null 2>&1
fi

mkdir -p "$out"

sources=(
    "$root/src/control.cpp"
    "$root/src/decode.cpp"
    "$root/src/regfile.cpp"
    "$root/wasm/bindings.cpp"
)

em++ -std=c++17 -O2 -Wall -Wextra -Wpedantic \
    -I"$root/src" \
    "${sources[@]}" \
    -lembind \
    -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web \
    -sALLOW_MEMORY_GROWTH=1 \
    --emit-tsd "$out/mipscore.d.mts" \
    -o "$out/mipscore.mjs"

echo "wasm: wrote $out/mipscore.{mjs,wasm,d.mts}"
