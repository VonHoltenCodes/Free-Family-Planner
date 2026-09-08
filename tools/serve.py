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
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'web')
DATA_DIR = os.environ.get('FP_DATA_DIR') or os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
DB_FILE = os.path.join(DATA_DIR, 'planner.json')
STATE_FILE = os.path.join(DATA_DIR, 'state.json')
HUB_FILE = os.path.join(DATA_DIR, 'hub.json')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hub_adapter  # noqa: E402
_db_lock = threading.Lock()
COLLECTIONS = ('notes', 'shopping', 'settings', 'chores', 'events')

def _db_load():
    try:
        with open(DB_FILE) as f: db = json.load(f)
    except (OSError, ValueError): db = {}
    db.setdefault('rev', 0); db.setdefault('data', {}); return db

FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

def derive_state(db):
    """Snapshot from the sync store alone (no display has published yet): meals, lists, chores, local events."""
    import datetime as dt
    d = db.get('data', {}); today = FULL_DAYS[(dt.date.today().weekday() + 1) % 7]
    meals = d.get('settings', {}).get('weeklyMeals', {})
    lst = lambda col: (lambda items: {'open': sum(1 for i in items if not i.get('completed')), 'total': len(items), 'items': [{'text': i.get('text', ''), 'completed': bool(i.get('completed'))} for i in items]})(sorted(d.get(col, {}).values(), key=lambda i: i.get('createdAt', ''), reverse=True))
    kids = {}
    try:
        cfg = re.search(r'export default (\{.*\});', open(os.path.join(ROOT, 'config.js')).read(), re.S); kids = {k['id']: k.get('name', k['id']) for k in json.loads(cfg.group(1)).get('family', {}).get('kids', [])} if cfg else {}
    except (OSError, ValueError, AttributeError): pass
    chores = {}
    for kid, doc in d.get('chores', {}).items():
        items = [c for c in doc.get('items', []) if c.get('text')]
        chores[kid] = {'name': kids.get(kid, kid), 'done': sum(1 for c in items if c.get('completed')), 'total': len(items), 'items': [{'text': c['text'], 'completed': bool(c.get('completed'))} for c in items]}
    now = dt.datetime.now().isoformat()
    evs = sorted([{'summary': e.get('summary', ''), 'calendar': 'Family', 'allDay': bool(e.get('allDay')), 'start': e.get('start'), 'end': e.get('end'), 'location': e.get('location', '')} for e in d.get('events', {}).values() if (e.get('end') or '') >= now[:10]], key=lambda e: e['start'] or '')[:8]
    return {'updatedAt': None, 'source': 'store', 'family': {}, 'meals': {'today': meals.get(today, ''), 'todayName': today, 'week': {k: meals.get(k, '') for k in FULL_DAYS}},
            'shopping': lst('shopping'), 'notes': lst('notes'), 'chores': chores, 'events': evs, 'weather': None}

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

    def _state(self):
        """Read-only snapshot for home hubs (Home Assistant REST sensor, Home-IO). The display PUTs it;
        without a snapshot we derive what we can from the sync store."""
        if self.command == 'PUT':
            try:
                snap = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0')) or b'{}'))
                if not isinstance(snap, dict) or 'meals' not in snap: raise ValueError('bad snapshot')
            except ValueError as e: return self._json(400, {'error': str(e)})
            os.makedirs(DATA_DIR, exist_ok=True)
            with open(STATE_FILE + '.tmp', 'w') as f: json.dump(snap, f)
            os.replace(STATE_FILE + '.tmp', STATE_FILE); return self._json(200, {'ok': True})
        try:
            with open(STATE_FILE) as f: snap = json.load(f)
        except (OSError, ValueError): snap = None
        if snap is None: snap = derive_state(_db_load())
        self.send_response(200); self.send_header('Content-Type', 'application/json'); self.send_header('Access-Control-Allow-Origin', '*')
        body = json.dumps(snap).encode(); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)

    def _hub(self):
        """Home hub proxy — same ops as web/api/hub.php. The hub URL/token stay in data/hub.json."""
        q = {k: v[0] for k, v in parse_qs(urlsplit(self.path).query).items()}; op = q.get('op', '')
        body = {}
        if self.command == 'POST':
            try: body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0')) or b'{}'))
            except ValueError: return self._json(400, {'error': 'bad body'})
        try:
            with open(HUB_FILE) as f: hub = json.load(f)
        except (OSError, ValueError): hub = {}
        try:
            if op == 'get': return self._json(200, {'type': hub.get('type', 'none'), 'url': hub.get('url', ''), 'hasToken': bool(hub.get('token')), 'todoEntity': hub.get('todoEntity', 'todo.shopping_list')})
            if op == 'save':
                if body.get('type') not in ('none', 'homeassistant', 'homeio'): return self._json(400, {'error': 'bad type'})
                new = {'type': body['type'], 'url': (body.get('url') or '').strip(), 'todoEntity': (body.get('todoEntity') or 'todo.shopping_list').strip(), 'token': body.get('token') if body.get('token') else hub.get('token', '')}
                os.makedirs(DATA_DIR, exist_ok=True)
                with open(HUB_FILE, 'w') as f: json.dump(new, f)
                try: os.chmod(HUB_FILE, 0o600)
                except OSError: pass
                return self._json(200, {'ok': True})
            a = hub_adapter.make(hub)
            if op == 'test': return self._json(200, {'ok': True, 'message': a.test()})
            if op == 'entities': return self._json(200, {'entities': a.entities()})
            if op == 'states': return self._json(200, {'states': a.states([i for i in q.get('ids', '').split(',') if i])})
            if op == 'calendars': return self._json(200, {'calendars': a.calendars()})
            if op == 'calevents': return self._json(200, {'events': a.cal_events(q.get('entity', ''), q.get('start', ''), q.get('end', ''))})
            if op == 'camera':
                ctype, data = a.camera(q.get('entity', '')); self.send_response(200); self.send_header('Content-Type', ctype); self.send_header('Cache-Control', 'no-store'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data); return None
            if op == 'call': a.call(body['entity'], body['action']); return self._json(200, {'ok': True})
            if op == 'todo': return self._json(200, {'items': a.todo_list()})
            if op == 'todo-add': a.todo_add(body['text']); return self._json(200, {'ok': True})
            if op == 'todo-set': a.todo_set(body['uid'], bool(body.get('completed'))); return self._json(200, {'ok': True})
            if op == 'todo-remove': a.todo_remove(body['uid']); return self._json(200, {'ok': True})
            return self._json(400, {'error': 'unknown op'})
        except hub_adapter.HubError as e: return self._json(502, {'error': str(e)})
        except KeyError as e: return self._json(400, {'error': f'missing {e}'})

    def do_PUT(self):
        if self.path.startswith('/api/db.php'): return self._db()
        if self.path.startswith('/api/state'): return self._state()
        return self.send_error(404)
    def do_DELETE(self): return self._db() if self.path.startswith('/api/db.php') else self.send_error(404)

    def _ics_proxy(self):
        # ICS feed proxy: only URLs present in web/config.js are allowed (no open proxy)
        url = parse_qs(urlsplit(self.path).query).get('url', [''])[0]
        try: cfg = open(os.path.join(ROOT, 'config.js')).read()
        except OSError: cfg = ''
        if not re.match(r'https?://', url) or json.dumps(url) not in cfg and f"'{url}'" not in cfg: return self.send_error(403, 'feed not in config')
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'FreeFamilyPlanner/1.0'}), timeout=15) as r: body = r.read()
        except Exception as e:  # noqa: BLE001
            return self.send_error(502, f'fetch failed: {e}')
        self.send_response(200); self.send_header('Content-Type', 'text/calendar; charset=utf-8'); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)

    def do_GET(self):
        if self.path.startswith('/api/db.php'): return self._db()
        if self.path.startswith('/api/ics.php'): return self._ics_proxy()
        if self.path.split('?')[0] in ('/api/state', '/api/state.php'): return self._state()
        if self.path.startswith('/api/hub.php'): return self._hub()
        if self.path in ('/', '/index.php', '/index.html'):
            self.path = '/app.html'
        if self.path.startswith('/includes/') or (self.path.startswith('/api/') and not self.path.split('?')[0] in ('/api/state', '/api/state.php')):
            self.send_error(403); return
        return super().do_GET()
    def do_POST(self):
        if self.path.startswith('/api/hub.php'): return self._hub()
        # the ⚙ setup wizard posts the config here (same path as the hosted PHP endpoint)
        if self.path.split('?')[0] not in ('/save-config.php', '/save-config'):
            self.send_error(404); return
        try:
            n = int(self.headers.get('Content-Length', '0')); cfg = json.loads(self.rfile.read(n) or b'{}')
            if not isinstance(cfg, dict) or 'family' not in cfg or 'location' not in cfg: raise ValueError('invalid config')
            clean = {k: cfg[k] for k in ('family', 'location', 'firebase', 'googleClientId', 'holidayCalendarId', 'backend', 'calendars', 'weather', 'house', 'defaultMode') if k in cfg}
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
