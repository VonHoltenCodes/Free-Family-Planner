#!/usr/bin/env python3
"""Local-host runner for Free Family Planner — no PHP, no login gate, no web host needed.

    python3 tools/serve.py                 # http://localhost:8765/
    python3 tools/serve.py --host 0.0.0.0  # also reachable from other devices on your LAN

Serves the web/ folder with app.html at /. Everything else (Firestore, Google Calendar,
WeatherStar, NWS) still runs in the browser exactly as on a hosted install.
Note: Google's OAuth only accepts http://localhost or an https:// origin as an authorized
JavaScript origin, so for Calendar sign-in open the page on the device itself via localhost,
or put a LAN hostname behind https. Firestore, WeatherStar and NWS work from any origin.
"""
import argparse, functools, http.server, json, os, re, shutil, sys, threading, webbrowser
from urllib.parse import urlsplit, parse_qs

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web')
DATA_DIR = os.environ.get('FP_DATA_DIR') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
DB_FILE = os.path.join(DATA_DIR, 'planner.json')
_db_lock = threading.Lock()
COLLECTIONS = ('notes', 'shopping', 'settings', 'chores', 'events')

def _db_load():
    try:
        with open(DB_FILE) as f: db = json.load(f)
    except (OSError, ValueError): db = {}
    db.setdefault('rev', 0); db.setdefault('data', {}); return db

def _db_save(db):
    os.makedirs(DATA_DIR, exist_ok=True); tmp = DB_FILE + '.tmp'
    with open(tmp, 'w') as f: json.dump(db, f)
    os.replace(tmp, DB_FILE)

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.mjs': 'text/javascript', '.woff': 'font/woff',
                      '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.json': 'application/json',
                      '.webp': 'image/webp'}
    def _json(self, code, obj):
        body = json.dumps(obj).encode(); self.send_response(code)
        self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)

    def _db(self):
        """Self-hosted sync store — same routes as web/api/db.php so the app needs no mode switch."""
        q = {k: v[0] for k, v in parse_qs(urlsplit(self.path).query).items()}
        with _db_lock:
            db = _db_load()
            if self.command == 'GET':
                return self._json(200, {'rev': db['rev'], 'data': db['data']} if 'all' in q else {'rev': db['rev']})
            c, i = q.get('c', ''), q.get('id', '')
            if c not in COLLECTIONS or not re.fullmatch(r'[A-Za-z0-9_.-]{1,64}', i): return self._json(400, {'error': 'bad request'})
            if self.command == 'PUT':
                try: doc = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0')) or b'{}'))
                except ValueError: return self._json(400, {'error': 'bad body'})
                db['data'].setdefault(c, {})[i] = doc
            elif self.command == 'DELETE': db['data'].get(c, {}).pop(i, None)
            else: return self._json(405, {'error': 'method'})
            db['rev'] += 1; _db_save(db); return self._json(200, {'rev': db['rev']})

    def do_PUT(self): return self._db() if self.path.startswith('/api/db.php') else self.send_error(404)
    def do_DELETE(self): return self._db() if self.path.startswith('/api/db.php') else self.send_error(404)

    def do_GET(self):
        if self.path.startswith('/api/db.php'): return self._db()
        if self.path in ('/', '/index.php', '/index.html'):
            self.path = '/app.html'
        if self.path.startswith('/includes/') or self.path.startswith('/api/'):
            self.send_error(403); return
        return super().do_GET()
    def do_POST(self):
        # the ⚙ setup wizard posts the config here (same path as the hosted PHP endpoint)
        if self.path.split('?')[0] not in ('/save-config.php', '/save-config'):
            self.send_error(404); return
        try:
            n = int(self.headers.get('Content-Length', '0')); cfg = json.loads(self.rfile.read(n) or b'{}')
            if not isinstance(cfg, dict) or 'family' not in cfg or 'location' not in cfg: raise ValueError('invalid config')
            clean = {k: cfg[k] for k in ('family', 'location', 'firebase', 'googleClientId', 'holidayCalendarId', 'backend', 'calendars', 'weather') if k in cfg}
            target = os.path.join(ROOT, 'config.js')
            if os.path.exists(target): shutil.copy(target, target + '.bak')
            with open(target, 'w') as f:
                f.write('// Free Family Planner — site config (written by the ⚙ setup wizard)\nexport default ' + json.dumps(clean, indent=2) + ';\n')
            body = b'{"ok":true}'; self.send_response(200)
        except Exception as e:  # noqa: BLE001
            body = json.dumps({'error': str(e)}).encode(); self.send_response(400)
        self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
        print(f'config.js {"written" if body.startswith(b"{\"ok") else "NOT written"}')
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, fmt, *args):
        if '404' in (args[1] if len(args) > 1 else ''):
            super().log_message(fmt, *args)

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--host', default='127.0.0.1'); ap.add_argument('--port', type=int, default=8765)
    ap.add_argument('--no-open', action='store_true', help="don't open a browser")
    a = ap.parse_args()
    if not os.path.exists(os.path.join(ROOT, 'config.js')):
        print('web/config.js missing — the ⚙ setup wizard will open in the browser and write it', file=sys.stderr)
    if not os.path.isdir(os.path.join(ROOT, 'ws4kp', 'resources')):
        print('web/ws4kp/ missing — run tools/build-ws4kp.sh (WeatherStar panel will be blank until then)', file=sys.stderr)
    srv = http.server.ThreadingHTTPServer((a.host, a.port), functools.partial(Handler, directory=ROOT))
    url = f'http://{"localhost" if a.host in ("127.0.0.1", "0.0.0.0") else a.host}:{a.port}/'
    print(f'Free Family Planner → {url}   (Ctrl+C to stop)\nsync store: {os.path.abspath(DB_FILE)}')
    if not a.no_open: webbrowser.open(url)
    try: srv.serve_forever()
    except KeyboardInterrupt: pass

if __name__ == '__main__': main()
