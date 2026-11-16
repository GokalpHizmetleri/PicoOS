# PicoOS board definition for the Raspberry Pi Pico 2 W (RP2350 + CYW43439).
# Based on the upstream RPI_PICO2_W board, with the lwIP limits raised so PicoOS can host one web server per installed app.

set(PICO_BOARD "pico2_w")
set(PICO_PLATFORM "rp2350")

set(MICROPY_PY_LWIP ON)
set(MICROPY_PY_NETWORK_CYW43 ON)

# Bluetooth stays enabled (the CYW43 driver build expects it) so apps/backends
# can use the `bluetooth` module.
set(MICROPY_PY_BLUETOOTH ON)
set(MICROPY_BLUETOOTH_BTSTACK ON)
set(MICROPY_PY_BLUETOOTH_CYW43 ON)

# PicoOS (and its web UI) is frozen into the firmware image.
set(MICROPY_FROZEN_MANIFEST ${MICROPY_BOARD_DIR}/manifest.py)

# 4 MB flash: ~1.5 MB for the firmware, the rest is the LittleFS user filesystem
# that holds configuration and installed apps.
if(NOT DEFINED MICROPY_HW_FLASH_STORAGE_BYTES)
    set(MICROPY_HW_FLASH_STORAGE_BYTES 2621440)
endif()

# More TCP control blocks: 1 dashboard server + up to 20 app servers, plus
# headroom for browsers that open several parallel connections.
list(APPEND MICROPY_DEF_BOARD
    MEMP_NUM_TCP_PCB=32
    MEMP_NUM_TCP_PCB_LISTEN=24
)
