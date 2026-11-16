# Fake `machine` module for the MicroPython unix port.
_v = {}


class Pin:
    OUT = 1
    IN = 0
    PULL_UP = 1
    PULL_DOWN = 2

    def __init__(self, pin, mode=None, pull=None):
        self.pin = pin

    def value(self, v=None):
        if v is None:
            return _v.get(self.pin, 0)
        _v[self.pin] = v


class ADC:
    def __init__(self, ch):
        pass

    def read_u16(self):
        return 14000


class RTC:
    def datetime(self, *a):
        return None


def freq():
    return 150000000


def reset():
    print("[fake] machine.reset()")
