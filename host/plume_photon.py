#!/usr/bin/env python3
"""Plume XPU Console on VEC1 Photon (Design Photon v0.6.0): the console without Node.js.

Photon replaces Electron's Node main process with a Python control plane and uses an installed
Edge/Chrome/Chromium as an isolated renderer. This host runs the console the same way:

  1. finds Design Photon (and offers to extract it from its WindowsSafe zip if only the zip exists),
  2. runs Photon's own release-integrity verification and refuses to start if it fails,
  3. serves web/ on 127.0.0.1 only, GET/HEAD for pages, with Photon-style Host/Origin/token guards,
     cross-origin isolation (so Wasm threads work) and a Content-Security-Policy whose script hashes
     are computed from the served pages; Google Fonts links are removed (no outbound network),
  4. offers a small token-guarded API: save worlds to worlds/, map stores to maps/, and feed .russ
     files to the in-browser verifier (Verify R files.cmd),
  5. opens the page in Photon's isolated app window (launch_browser from Photon's VEC1/app.py).

usage: python -B host/plume_photon.py [--page city.html] [--port 8788] [--photon PATH] [--no-browser]
       python -B host/plume_photon.py --no-photon [--page city.html]   (Python only, in your default browser)
       python -B host/plume_photon.py --verify file.russ [...]

Exit codes: 0 done; 1 a verification failed; 2 bad arguments; 3 Design Photon not found or not extracted
(Start Plume.cmd then runs --no-photon); 4 Photon's own release check failed (never bypassed).
SPDX-License-Identifier: GPL-3.0-only
"""
from __future__ import annotations

import argparse, base64, hashlib, hmac, json, os, re, secrets, sys, threading, time, urllib.parse, webbrowser, zipfile
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path, PurePosixPath

sys.dont_write_bytecode = True          # Photon's release check refuses unexpected __pycache__ files
CONSOLE_ROOT = Path(__file__).resolve().parent.parent
WEB = CONSOLE_ROOT / "web"
CONSOLE_VERSION = "1.4.1"
PHOTON_ZIP = "VEC1_Design_Photon_v0.6.0_WindowsSafe-r1.zip"
PHOTON_PRODUCT = "VEC1 Electron Substitute"
TYPES = {".html": "text/html; charset=utf-8", ".wasm": "application/wasm", ".js": "text/javascript; charset=utf-8",
         ".json": "application/json", ".css": "text/css; charset=utf-8", ".png": "image/png", ".bin": "application/octet-stream", ".gz": "application/gzip"}
SHARDS = CONSOLE_ROOT / "shards"                # baked shards, served read-only at /shards/
WORLD_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.plumeworld$")
MAP_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.zarr\.zip$")
MAX_WORLD, MAX_MAP, MAX_REPORT = 8 * 1024 * 1024, 300 * 1024 * 1024, 1024 * 1024
TOKEN_HEADER = "X-Plume-Token"


# ------------------------------------------------------------------ finding and verifying Photon
def _is_photon_root(p: Path) -> bool:
    try:
        if not (p / "VEC1" / "app.py").is_file(): return False
        m = json.loads((p / "RELEASE_MANIFEST.json").read_text(encoding="utf-8"))
        return m.get("product") == PHOTON_PRODUCT
    except (OSError, ValueError):
        return False


def _search(roots, depth=2):
    for root in roots:
        root = Path(root)
        if not root.is_dir(): continue
        frontier = [root]
        for _ in range(depth + 1):
            nxt = []
            for d in frontier:
                if _is_photon_root(d): return d
                try: nxt += sorted(x for x in d.iterdir() if x.is_dir() and not x.name.startswith("."))[:64]
                except OSError: pass
            frontier = nxt
    return None


def default_roots():
    home = Path.home()
    roots = [home / "Desktop" / "Project12k" / "languages" / "Photon-main"]
    if os.name == "nt": roots += [Path(f"{d}:/VEC1") for d in "CD"] + [Path(f"{d}:/Photon") for d in "CD"] + [Path(f"{d}:/Work/VEC1") for d in "CD"]
    else: roots += [home / "VEC1", home / "Photon"]
    return roots


def find_photon(explicit: str | None) -> Path | None:
    if explicit: return _search([explicit], depth=2)
    env = os.environ.get("PHOTON_HOME")
    if env:
        hit = _search([env], depth=2)
        if hit: return hit
    pin = Path(__file__).resolve().parent / "photon.path"
    if pin.is_file():
        hit = _search([pin.read_text(encoding="utf-8").strip()], depth=2)
        if hit: return hit
    return _search(default_roots(), depth=2)


def find_photon_zip(explicit: str | None = None):
    roots = [Path(x) for x in (explicit, os.environ.get("PHOTON_HOME")) if x] + default_roots()
    for root in roots:
        for cand in (root / PHOTON_ZIP, root / "Photon-main" / PHOTON_ZIP, root.parent / PHOTON_ZIP):
            if cand.is_file(): return cand
    return None


def incomplete_extractions(explicit: str | None = None):
    """folders that look like an extracted Design Photon but lack VEC1/app.py (an extraction cut short by long paths)"""
    roots = [Path(x) for x in (explicit, os.environ.get("PHOTON_HOME")) if x] + default_roots()
    out = []
    for root in roots:
        for d in (root, *(root.glob("VEC1_Design_Photon_*")), *(root.glob("*/VEC1_Design_Photon_*"))):
            try:
                if d.is_dir() and d.name.startswith("VEC1_Design_Photon_") and not (d / "VEC1" / "app.py").is_file() and d not in out: out.append(d)
            except OSError: pass
    return out


def safe_extract(zpath: Path, dest: Path):
    """Extract a zip without absolute paths, '..', drive letters or links, within a size budget."""
    with zipfile.ZipFile(zpath) as z:
        infos, total = z.infolist(), 0
        for info in infos:
            name = info.filename
            pp = PurePosixPath(name)
            if name.startswith(("/", "\\")) or ".." in pp.parts or ":" in name or "\\" in name: raise ValueError(f"unsafe path in zip: {name}")
            if (info.external_attr >> 16) & 0o170000 == 0o120000: raise ValueError(f"link in zip: {name}")
            total += info.file_size
        if total > 600 * 1024 * 1024: raise ValueError("zip expands beyond 600 MB")
        dest.mkdir(parents=True, exist_ok=True)
        for info in infos:
            target = (dest / info.filename).resolve()
            if dest.resolve() not in target.parents and target != dest.resolve(): raise ValueError(f"path escapes the destination: {info.filename}")
            z.extract(info, dest)


def verify_photon(root: Path):
    sys.path.insert(0, str(root / "VEC1"))
    from runtime.release_integrity import verify_release  # Photon's own verifier
    from runtime import VERSION
    report = verify_release(root)
    return report, VERSION


# ------------------------------------------------------------------ serving the console
def prepare_html(raw: bytes, token: str, host: str = "photon") -> tuple[bytes, str]:
    text = raw.decode("utf-8")
    text = re.sub(r'<link rel="preconnect" href="https://fonts\.googleapis\.com">\n?', "", text)
    text = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com/[^"]*">\n?', "", text)
    meta = f'<meta name="plume-token" content="{token}">\n<meta name="plume-host" content="{host}">\n'
    text = text.replace("<head>\n", "<head>\n" + meta, 1) if "<head>\n" in text else meta + text
    hashes = []
    for m in re.finditer(r"<script(?:\s[^>]*)?>(.*?)</script>", text, flags=re.S):
        hashes.append("'sha256-" + base64.b64encode(hashlib.sha256(m.group(1).encode("utf-8")).digest()).decode() + "'")
    csp = ("default-src 'self'; script-src 'self' 'wasm-unsafe-eval' " + " ".join(hashes) + "; worker-src 'self' blob:; "
           "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'none'; "
           "object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
    return text.encode("utf-8"), csp


class PlumeServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, addr, handler, token, photon_info, verify_files):
        super().__init__(addr, handler)
        self.token, self.photon_info, self.verify_files = token, photon_info, verify_files
        port = self.server_address[1]
        self.allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        self.allowed_origins = {f"http://{h}" for h in self.allowed_hosts}
        self.report = None
        self.html_cache = {}


class Handler(BaseHTTPRequestHandler):
    server_version = f"PlumePhoton/{CONSOLE_VERSION}"
    sys_version = ""
    timeout = 30

    def log_message(self, fmt, *args):
        if os.environ.get("PLUME_LOG"): sys.stderr.write("[plume] " + fmt % args + "\n")

    def _send(self, status, body=b"", ctype="text/plain; charset=utf-8", extra=None):
        self.send_response(status)
        for k, v in {"Content-Type": ctype, "Content-Length": str(len(body)), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
                     "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", "Cross-Origin-Opener-Policy": "same-origin",
                     "Cross-Origin-Embedder-Policy": "require-corp", "Cross-Origin-Resource-Policy": "same-origin",
                     "Permissions-Policy": "camera=(), microphone=(), geolocation=(), usb=(), serial=(), hid=()", **(extra or {})}.items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD" and body: self.wfile.write(body)

    def _json(self, obj, status=200): self._send(status, json.dumps(obj).encode(), "application/json")

    def _guard_host(self):
        if self.headers.get("Host", "") not in self.server.allowed_hosts:
            self._send(421, b"misdirected request"); return False
        return True

    def _guard_post(self, ctype, limit):
        origin = self.headers.get("Origin")
        if origin is not None and origin not in self.server.allowed_origins: self._json({"error": "forbidden", "detail": "bad origin"}, 403); return None
        if not hmac.compare_digest(self.headers.get(TOKEN_HEADER, ""), self.server.token): self._json({"error": "forbidden", "detail": "bad or missing token"}, 403); return None
        if (self.headers.get("Content-Type") or "").split(";")[0].strip().lower() != ctype: self._json({"error": "unsupported media type", "detail": f"Content-Type must be {ctype}"}, 415); return None
        try: n = int(self.headers.get("Content-Length", "-1"))
        except ValueError: n = -1
        if n < 0 or n > limit: self._json({"error": "bad length", "detail": f"Content-Length must be 0..{limit}"}, 413); return None
        return self.rfile.read(n)

    def do_GET(self):
        if not self._guard_host(): return
        try: path = urllib.parse.unquote(urllib.parse.urlparse(self.path).path)
        except Exception: return self._send(400, b"bad request")
        if "\0" in path: return self._send(400, b"bad request")
        if path.startswith("/api/"): return self._api_get(path)
        base = SHARDS if path.startswith("/shards/") else WEB
        rel = "index.html" if path in ("/", "") else (path[len("/shards/"):] if base is SHARDS else path.lstrip("/"))
        target = (base / rel).resolve()
        # Zarr chunk and shard files have no extension: serve those, inside shards/zarr only, as bytes
        zarr_chunk = base is SHARDS and (SHARDS / "zarr").resolve() in target.parents and target.suffix == ""
        if base.resolve() not in target.parents or (target.suffix not in TYPES and not zarr_chunk) or not target.is_file(): return self._send(404, b"not found")
        data = target.read_bytes()
        if zarr_chunk: return self._send(200, data, "application/octet-stream")
        if target.suffix == ".html":
            key = (str(target), target.stat().st_mtime_ns)
            if key not in self.server.html_cache: self.server.html_cache[key] = prepare_html(data, self.server.token, "photon" if self.server.photon_info.get("root") else "python")
            data, csp = self.server.html_cache[key]
            return self._send(200, data, TYPES[".html"], {"Content-Security-Policy": csp})
        self._send(200, data, TYPES[target.suffix])

    do_HEAD = do_GET

    def _api_get(self, path):
        info = self.server.photon_info
        if path == "/api/host":
            return self._json({"host": "photon" if info["root"] else "python", "photon_product": PHOTON_PRODUCT if info["root"] else None, "photon_version": info["version"], "photon_root": info["root"],
                               "console_version": CONSOLE_VERSION, "worlds": "worlds/", "maps": "maps/", "verify": bool(self.server.verify_files)})
        if path == "/api/worlds":
            d = CONSOLE_ROOT / "worlds"
            items = [{"name": f.name, "bytes": f.stat().st_size, "modified": int(f.stat().st_mtime)} for f in sorted(d.glob("*.plumeworld"))] if d.is_dir() else []
            return self._json({"worlds": items})
        m = re.fullmatch(r"/api/worlds/([^/]+)", path)
        if m:
            name = m.group(1)
            if not WORLD_NAME.match(name): return self._json({"error": "bad name"}, 400)
            f = CONSOLE_ROOT / "worlds" / name
            if not f.is_file(): return self._json({"error": "not found"}, 404)
            return self._send(200, f.read_bytes(), "text/plain; charset=utf-8")
        if path == "/api/verify":
            return self._json({"files": [{"index": i, "name": p.name, "bytes": p.stat().st_size} for i, p in enumerate(self.server.verify_files)]})
        m = re.fullmatch(r"/api/verify/(\d+)", path)
        if m:
            i = int(m.group(1))
            if i >= len(self.server.verify_files): return self._json({"error": "not found"}, 404)
            return self._send(200, self.server.verify_files[i].read_bytes(), "application/octet-stream")
        self._json({"error": "not found"}, 404)

    def do_POST(self):
        if not self._guard_host(): return
        path = urllib.parse.unquote(urllib.parse.urlparse(self.path).path)
        m = re.fullmatch(r"/api/worlds/([^/]+)", path)
        if m:
            name = m.group(1)
            if not WORLD_NAME.match(name): return self._json({"error": "bad name", "detail": "a world name ends in .plumeworld"}, 400)
            body = self._guard_post("application/json", MAX_WORLD)
            if body is None: return
            try: text = json.loads(body)["text"]
            except (ValueError, KeyError, TypeError): return self._json({"error": "bad request", "detail": "body must be {\"text\": ...}"}, 400)
            if not isinstance(text, str) or not text.startswith("PLUME-VALLEY/1\n"): return self._json({"error": "bad request", "detail": "not a PLUME-VALLEY/1 world"}, 400)
            return self._json(_atomic_write(CONSOLE_ROOT / "worlds" / name, text.encode("utf-8")))
        m = re.fullmatch(r"/api/maps/([^/]+)", path)
        if m:
            name = m.group(1)
            if not MAP_NAME.match(name): return self._json({"error": "bad name", "detail": "a map store name ends in .zarr.zip"}, 400)
            body = self._guard_post("application/zip", MAX_MAP)
            if body is None: return
            if not body.startswith(b"PK\x03\x04"): return self._json({"error": "bad request", "detail": "not a zip"}, 400)
            return self._json(_atomic_write(CONSOLE_ROOT / "maps" / name, body))
        if path == "/api/verify/report":
            body = self._guard_post("application/json", MAX_REPORT)
            if body is None: return
            try: self.server.report = json.loads(body)["results"]
            except (ValueError, KeyError, TypeError): return self._json({"error": "bad request"}, 400)
            self._json({"ok": True})
            if self.server.verify_files: threading.Thread(target=self.server.shutdown, daemon=True).start()
            return
        self._json({"error": "not found"}, 404)

    def _not_allowed(self):
        if self._guard_host(): self._send(405, b"method not allowed", extra={"Allow": "GET, HEAD, POST"})
    do_PUT = do_DELETE = do_PATCH = do_OPTIONS = _not_allowed


def _atomic_write(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + f".{secrets.token_hex(4)}.tmp")
    tmp.write_bytes(data); os.replace(tmp, path)
    return {"ok": True, "path": f"{path.parent.name}/{path.name}", "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def make_server(token, info, verify_files, port):
    ports = [port] if port else list(range(8788, 8818)) + [0]
    last = None
    for p in ports:
        try: return PlumeServer(("127.0.0.1", p), Handler, token, info, verify_files)
        except OSError as e: last = e
    raise RuntimeError(f"no local port available: {last}")


def profile_dir():
    base = Path(os.environ.get("LOCALAPPDATA", "")) if os.name == "nt" and os.environ.get("LOCALAPPDATA") else Path.home() / ".cache"
    return base / "PlumeXPU" / "photon-profile"


def main(argv=None):
    ap = argparse.ArgumentParser(description=f"Plume XPU Console {CONSOLE_VERSION} on VEC1 Photon (no Node.js)")
    ap.add_argument("--page", default="index.html", choices=["index.html", "simmy.html", "city.html", "show.html", "verify.html"])
    ap.add_argument("--port", type=int, default=0, help="fixed port; default tries 8788-8817")
    ap.add_argument("--photon", help="Design Photon root (the folder holding VEC1/app.py); default searches Photon-main and C:/VEC1")
    ap.add_argument("--extract-yes", action="store_true", help="extract Design Photon from its zip without asking")
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--allow-default-browser-fallback", action="store_true")
    ap.add_argument("--verify", nargs="+", metavar="FILE.russ", help="verify .russ files in the console's own verifier, in Photon's window")
    ap.add_argument("--no-photon", action="store_true", help="serve with Python only and open your default browser (same guards and API)")
    ns = ap.parse_args(argv)
    if not 0 <= ns.port <= 65535: raise SystemExit("REFUSED: port out of range.")
    if ns.no_photon: return serve(ns, None, {"version": None, "root": None})

    root = find_photon(ns.photon)
    if root is None:
        for d in incomplete_extractions(ns.photon):
            print(f"Note: {d} holds part of Design Photon but not VEC1\\app.py (an extraction cut short, often by Windows' path length); it is not used.")
        z = find_photon_zip(ns.photon)
        if z is None:
            print("Design Photon was not found. Set PHOTON_HOME to the folder holding VEC1\\app.py, pass --photon,"
                  " or put VEC1_Design_Photon_v0.6.0_WindowsSafe-r1.zip in Desktop\\Project12k\\languages\\Photon-main;"
                  " or run with --no-photon to use your default browser (Start Plume.cmd does this for you).", file=sys.stderr)
            return 3
        dest = Path("C:/VEC1/DesignPhoton") if os.name == "nt" else Path.home() / "VEC1" / "DesignPhoton"
        print(f"Design Photon is not extracted yet. Found {z}.")
        if not ns.extract_yes:
            ans = input(f"Extract it to {dest} (a short path, as Photon's README recommends)? [Y/n] ").strip().lower()
            if ans not in ("", "y", "yes"): print("Not extracted. Extract it yourself and set PHOTON_HOME, or pass --photon."); return 3
        try: safe_extract(z, dest)
        except (OSError, ValueError, zipfile.BadZipFile) as e: print(f"REFUSED: extraction failed: {e}", file=sys.stderr); return 3
        root = _search([dest], depth=2)
        if root is None: print("REFUSED: the extracted folder does not hold a Design Photon release.", file=sys.stderr); return 3
        (Path(__file__).resolve().parent / "photon.path").write_text(str(root), encoding="utf-8")

    report, version = verify_photon(root)
    if not report.get("ok"):
        print("REFUSED: Photon's release-integrity verification failed; the console will not run on a modified Photon.", file=sys.stderr)
        print(json.dumps(report, indent=2)[:4000], file=sys.stderr)
        return 4
    sys.path.insert(0, str(root / "VEC1"))
    import app as photon_app  # Photon's shell: launch_browser opens an isolated Chromium-family app window
    return serve(ns, photon_app, {"version": version, "root": str(root)})


def serve(ns, photon_app, info):
    """serve the console (with Photon's verified window, or with none: photon_app None opens the default browser)."""
    verify_files = []
    for f in ns.verify or []:
        p = Path(f).resolve()
        if not p.is_file(): print(f"REFUSED: not a file: {f}", file=sys.stderr); return 2
        if p.stat().st_size > 64 * 1024 * 1024: print(f"REFUSED: larger than 64 MB: {f}", file=sys.stderr); return 2
        verify_files.append(p)
    page = "verify.html" if verify_files else ns.page
    token = secrets.token_urlsafe(32)
    httpd = make_server(token, info, verify_files, ns.port)
    url = f"http://127.0.0.1:{httpd.server_address[1]}/{page}"
    if photon_app: print(f"Plume XPU Console {CONSOLE_VERSION} on {PHOTON_PRODUCT} {info['version']} (verified release at {info['root']})")
    else: print(f"Plume XPU Console {CONSOLE_VERSION} served by Python (no Design Photon); opening your default browser")
    print(f"  {url}")
    print("  loopback only; Host/Origin/token guarded; cross-origin isolated; Ctrl+C stops.", flush=True)
    if not ns.no_browser:
        def launch():
            if photon_app is None:
                if not webbrowser.open(url): print(f"Open {url} in your browser.", file=sys.stderr, flush=True)
                return
            exe = photon_app.launch_browser(url, profile_dir(), allow_default_fallback=ns.allow_default_browser_fallback)
            if exe is None: print(f"No isolated Edge/Chrome/Chromium was found. Open {url} yourself, or restart with --allow-default-browser-fallback.", file=sys.stderr, flush=True)
        threading.Timer(0.4, launch).start()
    try: httpd.serve_forever()
    except KeyboardInterrupt: pass
    finally: httpd.server_close()
    if verify_files:
        results = httpd.server_report if hasattr(httpd, "server_report") else httpd.report
        if not results: print("no verification report arrived"); return 1
        bad = 0
        for r in results:
            ok = bool(r.get("ok")); bad += 0 if ok else 1
            print(f"{'OK  ' if ok else 'FAIL'} {r.get('name')}: {r.get('detail')}")
        return 1 if bad else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
