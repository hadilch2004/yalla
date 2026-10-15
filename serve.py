"""Tiny dev server for Yalla: serves this folder and turns caching off, so edits always show up on reload.

    python3 serve.py              # http://localhost:5173 (this computer only)
    python3 serve.py 8000         # another port
    python3 serve.py --lan        # also reachable from your phone on the same Wi-Fi

--lan listens on your local network, so anyone on that network can open the app. Stop it (Ctrl+C) when you are done.
Directory listings and the wip/, supabase/ and .claude/ folders are never served.
"""
import http.server
import os
import socket
import sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))

HIDDEN = ("/wip", "/.claude", "/.git", "/supabase")


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_head(self):
        if any(self.path == h or self.path.startswith(h + "/") for h in HIDDEN):
            self.send_error(404)
            return None
        return super().send_head()

    def list_directory(self, path):  # no folder listings
        self.send_error(404)
        return None


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # no traffic is sent, this just picks the right network interface
        return s.getsockname()[0]
    except OSError:
        return None
    finally:
        s.close()


args = [a for a in sys.argv[1:] if not a.startswith("--")]
lan = "--lan" in sys.argv
port = int(args[0]) if args else 5173
host = "0.0.0.0" if lan else "127.0.0.1"
print(f"Yalla on http://localhost:{port}")
if lan:
    print(f"On your phone (same Wi-Fi): http://{lan_ip() or 'YOUR-COMPUTER-IP'}:{port}")
http.server.ThreadingHTTPServer((host, port), Handler).serve_forever()
