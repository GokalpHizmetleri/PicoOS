# Run PicoOS on the MicroPython *unix* port with fake hardware modules.
#   micropython tests/run_micropython.py <fs-dir> <port> [setup]
import os
import sys

here = __file__.rsplit("/", 1)[0] if "/" in __file__ else "."
if not here.startswith("/"):
    here = os.getcwd() + "/" + here
# Like on the device: the current directory ("") is the filesystem root and is
# searched first, so a stray folder there could shadow PicoOS modules.
os.chdir(sys.argv[1])
sys.path.append(here + "/../firmware")
sys.path.append(here + "/fakes")

from picoos import compat, config, timesvc  # noqa: E402

if "picoos" in os.listdir("."):
    raise SystemExit("a /picoos folder exists in the filesystem root and would shadow the package")

compat.ROOT = sys.argv[1]
compat.HTTP_PORT = int(sys.argv[2])
setup = len(sys.argv) > 3 and sys.argv[3] == "setup"

FLASH = 2621440  # same user-flash size as a real Pico 2 W running PicoOS


def statvfs():
    return FLASH, max(0, FLASH - compat.tree_size("/") - 180 * 1024)


compat.statvfs = statvfs

config.load()
if setup:
    config.set(ssid="", password="")
elif not config.get("ssid"):
    config.set(ssid="HomeNetwork", password="secret")


async def fake_geo():
    timesvc.state.update({"offset": 10800, "tz": "Europe/Istanbul", "city": "Istanbul", "country": "Turkey", "located": True})
    return True


timesvc.geolocate = fake_geo

from picoos import main  # noqa: E402

main.run()
