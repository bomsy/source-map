#!/usr/bin/env bash
#
# Build `lib/mappings.wasm` and its wasm-bindgen glue.
#
# Requires `wasm-pack` (https://rustwasm.github.io/wasm-pack/), which vendors
# its own `wasm-bindgen` and `wasm-opt` -- there is nothing else to install.
#
# Two targets are built because the package is CommonJS but also supports
# browsers via `package.json#browser`:
#
#   nodejs -> lib/mappings-glue.js          (CJS, reads mappings.wasm off disk)
#   web    -> lib/mappings-glue-browser.mjs (ESM, init() takes a URL or bytes)
#
# Both emit the same `.wasm`; only the glue differs.
#
# Set PROFILING=1 to enable the `profiling` cargo feature.

set -eu

cd "$(dirname "$0")"
REPO_ROOT="$(pwd)/.."
CRATE_DIR="source-map-mappings-wasm-api"

CARGO_ARGS=""
if [ "${PROFILING:-}" = "1" ]; then
    CARGO_ARGS="--features profiling"
fi

cd "$CRATE_DIR"
rm -rf pkg-node pkg-web

# shellcheck disable=SC2086
wasm-pack build --release --target nodejs \
    --out-dir pkg-node --out-name mappings --no-pack -- $CARGO_ARGS
# shellcheck disable=SC2086
wasm-pack build --release --target web \
    --out-dir pkg-web --out-name mappings --no-pack -- $CARGO_ARGS

# Both targets must agree on the binary; if they ever diverge, shipping one
# `mappings.wasm` for both would be silently wrong.
cmp pkg-node/mappings_bg.wasm pkg-web/mappings_bg.wasm

LIB="$REPO_ROOT/lib"
cp pkg-node/mappings_bg.wasm "$LIB/mappings.wasm"

# The glue looks for `mappings_bg.wasm`; we ship it as `mappings.wasm` so the
# URL documented for `SourceMapConsumer.initialize` keeps working.
sed -e "s/mappings_bg\.wasm/mappings.wasm/g" \
    -e 's|"\./mappings\.d\.ts"|"./mappings-glue.d.ts"|' \
    pkg-node/mappings.js > "$LIB/mappings-glue.js"
# `read-wasm-browser.js` always passes the module bytes or URL explicitly, so
# wasm-bindgen's `new URL(..., import.meta.url)` fallback is unreachable here.
# Replace it with a throw: `import.meta` is a hard parse error in webpack 4 and
# other pre-2020 bundlers, which would otherwise break any consumer using them.
sed -e "s/mappings_bg\.wasm/mappings.wasm/g" \
    -e 's|"\./mappings\.d\.ts"|"./mappings-glue-browser.d.mts"|' \
    -e 's|^.*import\.meta\.url.*$|        throw new Error("You must provide the string URL or ArrayBuffer contents of lib/mappings.wasm by calling SourceMapConsumer.initialize() before using SourceMapConsumer");|' \
    pkg-web/mappings.js > "$LIB/mappings-glue-browser.mjs"

cp pkg-node/mappings.d.ts "$LIB/mappings-glue.d.ts"
cp pkg-web/mappings.d.ts "$LIB/mappings-glue-browser.d.mts"

# Nothing should still point at the wasm-pack-internal name.
! grep -q "mappings_bg\.wasm" "$LIB/mappings-glue.js" "$LIB/mappings-glue-browser.mjs"
! grep -q "import\.meta" "$LIB/mappings-glue-browser.mjs"

echo "built $(wc -c < "$LIB/mappings.wasm") byte lib/mappings.wasm"
