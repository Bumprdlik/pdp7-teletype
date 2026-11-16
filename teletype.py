#!/usr/bin/env python3
"""Teletype 33 – prototyp „papírového“ terminálu pro PDP-7 Unix v0.

Spustí SIMH (pdp7) s konzolí na telnetu, připojí se k ní a přes HTTP
(Server-Sent Events + POST) ji zpřístupní stránce index.html.
Jen standardní knihovna Pythonu, poslouchá jen na 127.0.0.1.

    python3 teletype.py          → http://127.0.0.1:8033
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
TEL_PORT = 0          # konzole SIMH: volný port se vybere při každém startu
HTTP_PORT = 8033
HISTORY_MAX = 64 * 1024

IAC, DONT, DO, WONT, WILL, SB, SE = 255, 254, 253, 252, 251, 250, 240


class Hub:
    """Rozesílá výstup simulátoru všem připojeným stránkám."""

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
        print("vytvořena vlastní kopie disku:", img)
    shutil.copy(os.path.join(UNIX_BUILD, "boot.rim"), os.path.join(DISK_DIR, "boot.rim"))


def free_port():
    t = socket.socket()
    t.bind(("127.0.0.1", 0))
    port = t.getsockname()[1]
    t.close()
    return port


def start_simh():
    """Napíše konfiguraci s novým volným portem konzole a spustí SIMH.
    (Pevný port po ukončení ještě ~60 s drží jádro v TIME_WAIT a SIMH by ho neotevřel.)"""
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
    def die_with_parent():  # když server umře, SIMH dostane SIGTERM (a uloží disk)
        ctypes.CDLL("libc.so.6").prctl(1, signal.SIGTERM)  # PR_SET_PDEATHSIG

    proc = subprocess.Popen([SIMH, cfg], cwd=DISK_DIR, stdin=subprocess.PIPE,
                            stdout=log, stderr=subprocess.STDOUT, preexec_fn=die_with_parent)


restart_q = queue.Queue()


def restart_worker():
    """Trvalé vlákno pro restarty. PR_SET_PDEATHSIG se váže na vlákno, které proces
    spustilo – kdyby SIMH startovalo krátké vlákno, dostalo by SIGTERM hned po jeho konci."""
    while True:
        restart_q.get()
        restart_simh()


def stop_simh():
    """Korektně vypne SIMH: SIGTERM zastaví procesor, pak přes stdin odpojí disk (uloží ho) a quit.
    Samotný SIGTERM SIMH neukončí – jen čeká na příkaz."""
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
        print("SIMH nereaguje, ukončuji natvrdo")
        proc.kill()
        proc.wait()


def restart_simh():
    """Vypne simulátor (uloží disk) a nastartuje ho znovu – jako vypínač na PDP-7."""
    stop_simh()
    hub.publish(b"\r\n\r\n[RESTART POCITACE]\r\n")
    start_simh()


def telnet_loop():
    """Připojí se ke konzoli SIMH, odfiltruje telnetové příkazy, výstup pošle do Hubu."""
    global sock
    while True:
        try:
            s = socket.create_connection(("127.0.0.1", TEL_PORT), timeout=2)
            s.settimeout(None)
        except OSError:
            time.sleep(0.3)  # simulátor ještě startuje (nebo se restartuje)
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
            hub.publish(b"\r\n\r\n[SIMULATOR VYPNUT]\r\n")
        time.sleep(0.5)


def send_keys(data: bytes):
    data = data.replace(b"\xff", b"\xff\xff")  # binární režim: CR posíláme bez NUL
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
        sys.exit(f"chybí simulátor {SIMH}")
    signal.signal(signal.SIGTERM, lambda *a: (_ for _ in ()).throw(KeyboardInterrupt))
    srv = None
    for i in range(20):  # předchozí běh se možná ještě ukončuje
        try:
            srv = ThreadingHTTPServer(("127.0.0.1", HTTP_PORT), Handler)
            break
        except OSError:
            if i == 0:
                print(f"port {HTTP_PORT} je obsazený, čekám…")
            time.sleep(0.5)
    if not srv:
        sys.exit(f"port {HTTP_PORT} je pořád obsazený – neběží teletype jinde?")
    prepare_disk()
    start_simh()
    threading.Thread(target=telnet_loop, daemon=True).start()
    threading.Thread(target=restart_worker, daemon=True).start()
    url = f"http://127.0.0.1:{HTTP_PORT}"
    print(f"Teletype běží na {url}  (Ctrl+C = konec)")
    if "--no-browser" not in sys.argv:
        webbrowser.open(url)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
        print("ukládám disk a vypínám PDP-7…")
        stop_simh()


if __name__ == "__main__":
    main()
