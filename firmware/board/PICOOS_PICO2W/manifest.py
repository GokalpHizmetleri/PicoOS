# Frozen manifest for the PicoOS firmware image.
include("$(PORT_DIR)/boards/manifest.py")

require("bundle-networking")

# PicoOS itself: firmware/main.py and the firmware/picoos package
# (which includes the generated, gzipped web UI in picoos/assets.py).
freeze("$(BOARD_DIR)/../..", "main.py")
package("picoos", base_path="$(BOARD_DIR)/../..")
