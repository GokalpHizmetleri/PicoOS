# PicoOS entry point (frozen into the firmware).
# Press Ctrl+C on the USB serial console to stop PicoOS and get a REPL.
import sys

# Prefer the frozen PicoOS over anything on the filesystem with the same name.
if ".frozen" in sys.path:
    sys.path.remove(".frozen")
    sys.path.insert(0, ".frozen")

import picoos.main  # noqa: E402

picoos.main.run()
