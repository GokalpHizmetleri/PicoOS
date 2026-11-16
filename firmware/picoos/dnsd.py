# PicoOS - tiny captive-portal DNS server.
# While the setup access point is running, every DNS query is answered with the
# Pico's own address so phones and laptops pop up the Wi-Fi setup page.
import socket

from . import compat
from .log import log


def _answer(query, ip):
    try:
        # Header: copy ID, set flags (standard response, no error), 1 question, 1 answer.
        hdr = query[:2] + b"\x81\x80" + query[4:6] + query[4:6] + b"\x00\x00\x00\x00"
        # Question section ends at the first zero-length label + QTYPE + QCLASS.
        i = 12
        while i < len(query) and query[i] != 0:
            i += query[i] + 1
        question = query[12:i + 5]
        answer = b"\xc0\x0c" + b"\x00\x01\x00\x01" + b"\x00\x00\x00\x3c" + b"\x00\x04"
        answer += bytes(int(x) for x in ip.split("."))
        return hdr + question + answer
    except Exception:
        return None


async def run(ip, stop_flag):
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    except Exception:
        pass
    s.bind(socket.getaddrinfo("0.0.0.0", 53)[0][-1])
    s.setblocking(False)
    log("Captive DNS running")
    try:
        while not stop_flag[0]:
            try:
                data, addr = s.recvfrom(512)
            except OSError:
                await compat.sleep_ms(30)
                continue
            if len(data) < 12:
                continue
            resp = _answer(data, ip)
            if resp:
                try:
                    s.sendto(resp, addr)
                except OSError:
                    pass
    finally:
        s.close()
