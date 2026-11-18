#!/bin/sh
# Build the console pages. Needs clang (wasm32 + wasm-ld) and Python 3.10+; no Node.js.
# (Node and Playwright are used only by the optional developer smoke test at the end.)
# SPDX-License-Identifier: GPL-3.0-only
set -e
cd "$(dirname "$0")"
COMMON="--target=wasm32 -O3 -msimd128 -nostdlib -ffreestanding -Wall -Wl,--no-entry -Wl,--strip-all -Wl,-z,stack-size=65536"
clang $COMMON -Wl,--export-memory -Wl,--initial-memory=20971520 -o web/xpu.wasm src/xpu.c
clang $COMMON -DXPU_THREADS -matomics -mbulk-memory -Wl,--import-memory -Wl,--shared-memory \
  -Wl,--initial-memory=20971520 -Wl,--max-memory=20971520 -Wl,--export=__stack_pointer -o web/xpu-mt.wasm src/xpu.c
echo "built web/xpu.wasm ($(wc -c < web/xpu.wasm) B) web/xpu-mt.wasm ($(wc -c < web/xpu-mt.wasm) B)"
mkdir -p dist
python3 -B tools/bundle.py
# developer checks (Node): every built page's script parses, the shaders keep clear of what breaks Direct3D's
# compiler, and (with Playwright) the built pages start with no errors
if [ "${SKIP_SMOKE:-0}" != "1" ]; then
  for f in web/*.html dist/*.html; do
    python3 -I -c 'import sys; s = open(sys.argv[1], encoding="utf-8").read(); i = s.find("<script type=\"module\">"); sys.stdout.write(s[i + 22:s.index("</script>", i)] if i >= 0 else "")' "$f" > /tmp/plume-page-check.mjs
    node --check /tmp/plume-page-check.mjs || { echo "a script in $f does not parse"; exit 1; }
  done
  node tools/check_shaders.mjs
  node tools/smoke.cjs
fi
