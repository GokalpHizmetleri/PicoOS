#!/usr/bin/env bash
# Build dist/PicoOS-pico2w.uf2: MicroPython + PicoOS (frozen) for the Pico 2 W.
#
#   ./tools/build_firmware.sh                 # clones MicroPython into ./build/
#   MICROPYTHON_DIR=~/micropython ./tools/build_firmware.sh
#
# Requirements: git, make, cmake, python3, arm-none-eabi-gcc (+ newlib).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MP_VERSION="${MP_VERSION:-v1.29.0}"
MP_DIR="${MICROPYTHON_DIR:-$ROOT/build/micropython}"
BOARD_DIR="$ROOT/firmware/board/PICOOS_PICO2W"
JOBS="${JOBS:-$(nproc 2>/dev/null || echo 4)}"
VERSION="$(python3 -c "import re;print(re.search(r'VERSION = \"(.+?)\"', open('$ROOT/firmware/picoos/__init__.py').read()).group(1))")"

echo "==> PicoOS $VERSION, MicroPython $MP_VERSION"

if [ ! -d "$MP_DIR/.git" ]; then
  echo "==> Cloning MicroPython $MP_VERSION"
  git clone --depth 1 --branch "$MP_VERSION" https://github.com/micropython/micropython.git "$MP_DIR"
fi

echo "==> Bundling web UI"
python3 "$ROOT/tools/build_assets.py"

echo "==> Building mpy-cross"
make -C "$MP_DIR/mpy-cross" -j"$JOBS" >/dev/null

echo "==> Fetching rp2 submodules"
make -C "$MP_DIR/ports/rp2" BOARD_DIR="$BOARD_DIR" submodules >/dev/null

echo "==> Building firmware"
make -C "$MP_DIR/ports/rp2" BOARD_DIR="$BOARD_DIR" -j"$JOBS"

mkdir -p "$ROOT/dist"
cp "$MP_DIR/ports/rp2/build-PICOOS_PICO2W/firmware.uf2" "$ROOT/dist/PicoOS-pico2w.uf2"
cp "$MP_DIR/ports/rp2/build-PICOOS_PICO2W/firmware.uf2" "$ROOT/dist/PicoOS-pico2w-v$VERSION.uf2"
ls -la "$ROOT/dist"
echo "==> Done: dist/PicoOS-pico2w.uf2"
