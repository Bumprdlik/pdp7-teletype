#!/usr/bin/env python3
"""Teletype 33 - a paper-roll terminal for PDP-7 Unix v0.

Starts SIMH (pdp7) with its console on telnet, connects to it and exposes it
to index.html over HTTP (Server-Sent Events + POST).
Python standard library only; listens on 127.0.0.1 only.

    python3 teletype.py          -> http://127.0.0.1:8033
"""
import ctypes
import json
import os
import signal
import queue
import shutil
import socket
import subprocess
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
UNIX_BUILD = os.path.expanduser(os.environ.get("PDP7_UNIX_BUILD", "~/Applications/pdp7-unix/build"))
SIMH = os.path.expanduser(os.environ.get("SIMH_PDP7", "~/Applications/simh/BIN/pdp7"))
DISK_DIR = os.path.join(HERE, "disk")
TEL_PORT = 0          # SIMH console: a free port is picked on every start
HTTP_PORT = 8033
HISTORY_MAX = 64 * 1024

IAC, DONT, DO, WONT, WILL, SB, SE = 255, 254, 253, 252, 251, 250, 240


class Hub:
    """Broadcasts simulator output to all connected pages."""

    def __init__(self):
        self.lock = threading.Lock()
        self.clients = []
        self.history = bytearray()

    def publish(self, data: bytes):
        with self.lock:
            self.history += data
            del self.history[:-HISTORY_MAX]
            for q in self.clients:
                q.put(data)

    def subscribe(self):
        q = queue.Queue()
        with self.lock:
            self.clients.append(q)
            hist = bytes(self.history)
        return q, hist

    def unsubscribe(self, q):
        with self.lock:
            if q in self.clients:
                self.clients.remove(q)


hub = Hub()
sock = None
sock_lock = threading.Lock()
proc = None


def prepare_disk():
    os.makedirs(DISK_DIR, exist_ok=True)
    img = os.path.join(DISK_DIR, "image.fs")
    if not os.path.exists(img):
        shutil.copy(os.path.join(UNIX_BUILD, "image.fs"), img)
        print("created a private copy of the disk:", img)
    shutil.copy(os.path.join(UNIX_BUILD, "boot.rim"), os.path.join(DISK_DIR, "boot.rim"))


def free_port():
    t = socket.socket()
    t.bind(("127.0.0.1", 0))
    port = t.getsockname()[1]
    t.close()
    return port


def start_simh():
    """Write the config with a fresh free console port and start SIMH.
    (A fixed port stays in TIME_WAIT for ~60 s after exit and SIMH could not reopen it.)"""
    global proc, TEL_PORT
    TEL_PORT = free_port()
    cfg = os.path.join(DISK_DIR, "teletype.simh")
    with open(cfg, "w") as f:
        f.write(f"""set console telnet=127.0.0.1:{TEL_PORT}
set console telnet=buffered
set cpu 8k
set cpu eae
set tti unix
set rb ena
att rb image.fs
set lpt disa
set drm disa
set dt disa
load boot.rim 010000
go
""")
    log = open(os.path.join(DISK_DIR, "simh.log"), "w")
    def die_with_parent():  # if the server dies, SIMH gets SIGTERM
        ctypes.CDLL("libc.so.6").prctl(1, signal.SIGTERM)  # PR_SET_PDEATHSIG

    proc = subprocess.Popen([SIMH, cfg], cwd=DISK_DIR, stdin=subprocess.PIPE,
                            stdout=log, stderr=subprocess.STDOUT, preexec_fn=die_with_parent)


restart_q = queue.Queue()


def restart_worker():
    """Long-lived thread for restarts. PR_SET_PDEATHSIG is tied to the *thread* that
    spawned the process - if a short-lived thread started SIMH, it would get SIGTERM
    as soon as that thread exited."""
    while True:
        restart_q.get()
        restart_simh()


def stop_simh():
    """Shut SIMH down cleanly: SIGTERM stops the CPU, then detach the disk (saving it)
    and quit via stdin. SIGTERM alone does not exit SIMH - it just waits for a command."""
    global sock
    with sock_lock:
        if sock:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            sock.close()
            sock = None
    if not proc or proc.poll() is not None:
        return
    proc.terminate()
    time.sleep(0.3)
    try:
        proc.stdin.write(b"detach rb\nquit\n")
        proc.stdin.flush()
        proc.stdin.close()
    except (BrokenPipeError, OSError):
        pass
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        print("SIMH not responding, killing it")
        proc.kill()
        proc.wait()


def restart_simh():
    """Power-cycle the PDP-7: stop the simulator (saving the disk) and start it again."""
    stop_simh()
    hub.publish(b"\r\n\r\n[COMPUTER RESTART]\r\n")
    start_simh()


def telnet_loop():
    """Connect to the SIMH console, strip telnet commands, publish output to the hub."""
    global sock
    while True:
        try:
            s = socket.create_connection(("127.0.0.1", TEL_PORT), timeout=2)
            s.settimeout(None)
        except OSError:
            time.sleep(0.3)  # simulator still starting (or restarting)
            continue
        with sock_lock:
            sock = s
        state, cmd = 0, 0
        while True:
            try:
                data = s.recv(4096)
            except OSError:
                data = b""
            if not data:
                break
            out = bytearray()
            for b in data:
                if state == 0:
                    if b == IAC:
                        state = 1
                    else:
                        out.append(b & 0x7F)
                elif state == 1:
                    if b in (DO, DONT, WILL, WONT):
                        cmd, state = b, 2
                    elif b == SB:
                        state = 3
                    else:
                        if b == IAC:
                            out.append(0x7F)
                        state = 0
                elif state == 2:
                    if cmd == DO:
                        s.sendall(bytes([IAC, WILL if b in (0, 3) else WONT, b]))
                    elif cmd == WILL:
                        s.sendall(bytes([IAC, DO if b in (0, 1, 3) else DONT, b]))
                    state = 0
                elif state == 3:
                    if b == IAC:
                        state = 4
                elif state == 4:
                    state = 0 if b == SE else 3
            if out:
                hub.publish(bytes(out))
        with sock_lock:
            if sock is s:
                sock = None
        try:
            s.close()
        except OSError:
            pass
        if proc and proc.poll() is not None:
            hub.publish(b"\r\n\r\n[SIMULATOR STOPPED]\r\n")
        time.sleep(0.5)


def send_keys(data: bytes):
    data = data.replace(b"\xff", b"\xff\xff")  # binary mode: CR is sent without NUL
    with sock_lock:
        if sock:
            try:
                sock.sendall(data)
            except OSError:
                pass


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            with open(os.path.join(HERE, "index.html"), "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path.startswith("/sounds/"):
            name = os.path.basename(self.path)
            p = os.path.join(HERE, "sounds", name)
            if not name.endswith(".wav") or not os.path.isfile(p):
                return self.send_error(404)
            with open(p, "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/sounds.json":
            d = os.path.join(HERE, "sounds")
            names = sorted(f for f in os.listdir(d) if f.endswith(".wav")) if os.path.isdir(d) else []
            body = json.dumps(names).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/stream":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            q, hist = hub.subscribe()
            try:
                self.wfile.write(f"data: {json.dumps({'h': hist.decode('latin-1')})}\n\n".encode())
                self.wfile.flush()
                while True:
                    try:
                        d = q.get(timeout=15)
                        msg = json.dumps({"d": d.decode("latin-1")})
                    except queue.Empty:
                        msg = "{}"
                    self.wfile.write(f"data: {msg}\n\n".encode())
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                hub.unsubscribe(q)
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path == "/reset":
            restart_q.put(1)
            self.send_response(204)
            self.end_headers()
            return
        if self.path != "/key":
            return self.send_error(404)
        n = int(self.headers.get("Content-Length", 0))
        send_keys(self.rfile.read(n))
        self.send_response(204)
        self.end_headers()


def main():
    if not os.path.exists(SIMH):
        sys.exit(f"simulator not found: {SIMH} (set SIMH_PDP7)")
    signal.signal(signal.SIGTERM, lambda *a: (_ for _ in ()).throw(KeyboardInterrupt))
    srv = None
    for i in range(20):  # a previous run may still be shutting down
        try:
            srv = ThreadingHTTPServer(("127.0.0.1", HTTP_PORT), Handler)
            break
        except OSError:
            if i == 0:
                print(f"port {HTTP_PORT} is busy, waiting...")
            time.sleep(0.5)
    if not srv:
        sys.exit(f"port {HTTP_PORT} is still busy - is teletype running elsewhere?")
    prepare_disk()
    start_simh()
    threading.Thread(target=telnet_loop, daemon=True).start()
    threading.Thread(target=restart_worker, daemon=True).start()
    url = f"http://127.0.0.1:{HTTP_PORT}"
    print(f"Teletype running at {url}  (Ctrl+C to quit)")
    if "--no-browser" not in sys.argv:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
        print("saving disk and powering off the PDP-7...")
        stop_simh()


if __name__ == "__main__":
    main()
