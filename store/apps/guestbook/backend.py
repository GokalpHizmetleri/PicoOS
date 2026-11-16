# Guestbook backend - runs on the Pico inside PicoOS.
#
# PicoOS calls handle() for every request to /api/... on this app's port.
# Return a dict/list (sent as JSON), a string, None (204) or
# a (status, content_type, body) tuple. `sdk` gives you per-app storage.
import json
import time

sdk = None
MAX = 100


def setup(s):
    global sdk
    sdk = s
    sdk.log("guestbook ready with", len(sdk.get("entries", [])), "entries")


def handle(method, path, query, body):
    entries = sdk.get("entries", [])
    if path == "/entries" and method == "GET":
        return {"entries": entries[-50:][::-1], "total": len(entries)}
    if path == "/entries" and method == "POST":
        data = json.loads(body or b"{}")
        name = str(data.get("name", "")).strip()[:32] or "Anonymous"
        text = str(data.get("text", "")).strip()[:280]
        if not text:
            return (400, "application/json", json.dumps({"error": "Message is empty"}))
        entries.append({"name": name, "text": text, "t": time.time()})
        sdk.set("entries", entries[-MAX:])
        return {"ok": True, "total": len(entries)}
    return (404, "application/json", json.dumps({"error": "Unknown endpoint"}))
