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
API_TOKEN_FILE = os.path.join(DATA_DIR, 'api-token')   # optional: if present, /api/v1 requires 'Authorization: Bearer <token>'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hub_adapter  # noqa: E402
_db_lock = threading.Lock()
COLLECTIONS = ('notes', 'shopping', 'settings', 'chores', 'events')

def _db_load():
    try:
        with open(DB_FILE) as f: db = json.load(f)
    except (OSError, ValueError): db = {}
    db.setdefault('rev', 0); db.setdefault('data', {}); return db

_power_cache = {'t': 0, 'data': None}
def comed_prices():
    """ComEd Hourly Pricing: current-hour average + 5-min price (documented API) and today's/tomorrow's
    day-ahead hourly prices (the undocumented ServletFeed the ComEd site itself uses). ¢/kWh, Central time."""
    import time, datetime as dt
    try: from zoneinfo import ZoneInfo; now = dt.datetime.now(ZoneInfo('America/Chicago'))
    except Exception: now = dt.datetime.now()  # noqa: BLE001
    if _power_cache['data'] and time.time() - _power_cache['t'] < 300: return _power_cache['data']
    def get(url):
        with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'FreeFamilyPlanner/1.0'}), timeout=15) as r: return r.read().decode()
    def day(d):
        raw = get(f'https://hourlypricing.comed.com/rrtp/ServletFeed?type=daynexttoday&date={d:%Y%m%d}')
        return [{'hour': int(m.group(4)), 'price': float(m.group(5))} for m in re.finditer(r'Date\.UTC\((\d+),(\d+),(\d+),(\d+),0,0\),\s*([\d.]+)', raw)]
    out = {'provider': 'comed', 'units': '¢/kWh', 'updatedAt': now.isoformat(), 'hour': now.hour, 'current': None, 'fiveMin': None, 'today': [], 'tomorrow': []}
    try: out['current'] = float(json.loads(get('https://hourlypricing.comed.com/api?type=currenthouraverage'))[0]['price'])
    except Exception as e: out['error'] = f'current: {e}'  # noqa: BLE001
    try: out['fiveMin'] = float(json.loads(get('https://hourlypricing.comed.com/api?type=5minutefeed'))[0]['price'])
    except Exception: pass  # noqa: BLE001
    try: out['today'] = day(now.date())
    except Exception as e: out['error'] = f'day-ahead: {e}'  # noqa: BLE001
    try: out['tomorrow'] = day(now.date() + dt.timedelta(days=1))
    except Exception: out['tomorrow'] = []  # noqa: BLE001
    _power_cache.update(t=time.time(), data=out); return out

class ApiError(Exception):
    def __init__(self, code, msg): super().__init__(msg); self.code = code

V1_ROUTES = ['GET /api/v1', 'GET|PUT|PATCH /api/v1/config', 'GET|PUT|POST /api/v1/tiles, DELETE /api/v1/tiles/{entity}',
             'GET|PUT|PATCH /api/v1/hub', 'GET /api/v1/hub/test', 'GET /api/v1/hub/entities[?domain=]', 'GET /api/v1/hub/states?ids=a,b', 'POST /api/v1/hub/call {entity,action}',
             'GET /api/v1/hub/calendars', 'GET|POST|PATCH|DELETE /api/v1/hub/todo', 'GET|POST /api/v1/lists/{shopping|notes}, PATCH|DELETE /api/v1/lists/{col}/{id}',
             'GET|PUT|PATCH /api/v1/meals', 'GET /api/v1/chores, GET|PUT /api/v1/chores/{kid}', 'GET|POST /api/v1/events, PUT|PATCH|DELETE /api/v1/events/{id}', 'GET /api/v1/state', 'GET /api/v1/power']
CONFIG_KEYS = ('family', 'location', 'firebase', 'googleClientId', 'holidayCalendarId', 'backend', 'calendars', 'weather', 'house', 'defaultMode', 'defaultTab', 'power')
def now_iso():
    import datetime as dt; return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z')
def new_id():
    import time, random, string; return format(int(time.time() * 1000), 'x') + ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
def deep_merge(base, layer):
    out = dict(base)
    for k, v in (layer or {}).items(): out[k] = deep_merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out
def config_read():
    try: m = re.search(r'export default (\{.*\});', open(os.path.join(ROOT, 'config.js')).read(), re.S); return json.loads(m.group(1)) if m else {}
    except (OSError, ValueError): return {}
def config_write(cfg):
    if not isinstance(cfg, dict): raise ApiError(400, 'config must be a JSON object')
    clean = {k: cfg[k] for k in CONFIG_KEYS if k in cfg}; target = os.path.join(ROOT, 'config.js')
    if os.path.exists(target): shutil.copy(target, target + '.bak')
    with open(target, 'w') as f: f.write('// Free Family Planner — site config (written via the API)\nexport default ' + json.dumps(clean, indent=2) + ';\n')
def hub_read():
    try:
        with open(HUB_FILE) as f: return json.load(f)
    except (OSError, ValueError): return {}
def hub_write(h):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(HUB_FILE, 'w') as f: json.dump(h, f)
    try: os.chmod(HUB_FILE, 0o600)
    except OSError: pass

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

    # ---------------- /api/v1 — the documented API (docs/api.md); same routes as web/api/v1.php ----------------
    def _v1_auth(self):
        try: tok = open(API_TOKEN_FILE).read().strip()
        except OSError: return True          # no token file → open on the LAN (local-host mode)
        return self.headers.get('Authorization', '') == f'Bearer {tok}' or parse_qs(urlsplit(self.path).query).get('token', [''])[0] == tok

    def _v1(self):
        if not self._v1_auth(): return self._json(401, {'error': 'missing or wrong API token (Authorization: Bearer …)'})
        u = urlsplit(self.path); parts = [p for p in u.path.split('/')[3:] if p]; q = {k: v[0] for k, v in parse_qs(u.query).items()}; m = self.command
        body = {}
        if m in ('POST', 'PUT', 'PATCH'):
            try: body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', '0')) or b'{}'))
            except ValueError: return self._json(400, {'error': 'body must be JSON'})
        try: return self._v1_route(parts, m, q, body)
        except hub_adapter.HubError as e: return self._json(502, {'error': str(e)})
        except KeyError as e: return self._json(400, {'error': f'missing field {e}'})
        except ApiError as e: return self._json(e.code, {'error': str(e)})

    def _v1_route(self, parts, m, q, body):
        J = self._json
        if not parts: return J(200, {'name': 'Free Family Planner API', 'version': 1, 'docs': 'https://github.com/VonHoltenCodes/Free-Family-Planner/blob/main/docs/api.md', 'routes': V1_ROUTES})
        head = parts[0]
        # --- config ---
        if head == 'config':
            cfg = config_read()
            if m == 'GET': return J(200, cfg)
            if m == 'PUT': config_write(body); return J(200, config_read())
            if m == 'PATCH': config_write(deep_merge(cfg, body)); return J(200, config_read())
            raise ApiError(405, 'GET, PUT or PATCH')
        # --- tiles (config.house.tiles) ---
        if head == 'tiles':
            cfg = config_read(); tiles = cfg.setdefault('house', {}).setdefault('tiles', [])
            if m == 'GET': return J(200, {'tiles': tiles})
            if m == 'PUT': cfg['house']['tiles'] = body if isinstance(body, list) else body.get('tiles', []); config_write(cfg); return J(200, {'tiles': cfg['house']['tiles']})
            if m == 'POST':
                t = {'entity': body['entity'], 'label': body.get('label', body['entity']), 'kind': body.get('kind'), 'control': bool(body.get('control', False))}
                t = {k: v for k, v in t.items() if v is not None}; tiles[:] = [x for x in tiles if x.get('entity') != t['entity']] + [t]; config_write(cfg); return J(201, {'tiles': tiles})
            if m == 'DELETE' and len(parts) > 1:
                n = len(tiles); tiles[:] = [x for x in tiles if x.get('entity') != parts[1]]; config_write(cfg); return J(200 if len(tiles) < n else 404, {'tiles': tiles})
            raise ApiError(405, 'GET, PUT, POST or DELETE /tiles/{entity}')
        # --- hub ---
        if head == 'hub':
            hub = hub_read()
            if len(parts) == 1:
                if m == 'GET': return J(200, {'type': hub.get('type', 'none'), 'url': hub.get('url', ''), 'hasToken': bool(hub.get('token')), 'todoEntity': hub.get('todoEntity', 'todo.shopping_list')})
                if m in ('PUT', 'PATCH'):
                    if body.get('type', hub.get('type', 'none')) not in ('none', 'homeassistant', 'homeio'): raise ApiError(400, 'type must be none, homeassistant or homeio')
                    new = {**hub, **{k: v for k, v in body.items() if k in ('type', 'url', 'todoEntity', 'token') and v is not None}}; hub_write(new); return J(200, {'ok': True})
                raise ApiError(405, 'GET, PUT or PATCH')
            sub = parts[1]; a = hub_adapter.make(hub)
            if sub == 'test': return J(200, {'ok': True, 'message': a.test()})
            if sub == 'entities': ents = a.entities(); dom = q.get('domain'); return J(200, {'entities': [e for e in ents if not dom or e['domain'] == dom]})
            if sub == 'states': return J(200, {'states': a.states([i for i in q.get('ids', '').split(',') if i])})
            if sub == 'call' and m == 'POST': a.call(body['entity'], body['action']); return J(200, {'ok': True})
            if sub == 'calendars': return J(200, {'calendars': a.calendars()})
            if sub == 'todo':
                if m == 'GET': return J(200, {'items': a.todo_list()})
                if m == 'POST': a.todo_add(body['text']); return J(201, {'ok': True})
                if m == 'PATCH': a.todo_set(body['uid'], bool(body.get('completed', True))); return J(200, {'ok': True})
                if m == 'DELETE': a.todo_remove(body.get('uid') or q.get('uid')); return J(200, {'ok': True})
            raise ApiError(404, 'unknown hub route')
        # --- data (self-hosted sync store only) ---
        if head in ('lists', 'meals', 'chores', 'events'):
            with _db_lock:
                db = _db_load(); d = db['data']
                def commit(): db['rev'] += 1; _db_save(db)
                if head == 'lists':
                    col = parts[1] if len(parts) > 1 else None
                    if col not in ('shopping', 'notes'): raise ApiError(404, 'lists/shopping or lists/notes')
                    items = d.setdefault(col, {})
                    if m == 'GET': return J(200, {'items': sorted([{'id': k, **v} for k, v in items.items()], key=lambda i: i.get('createdAt', ''), reverse=True)})
                    if m == 'POST': i = new_id(); items[i] = {'text': body['text'], 'completed': False, 'createdAt': now_iso()}; commit(); return J(201, {'id': i, **items[i]})
                    if len(parts) > 2 and parts[2] in items:
                        if m == 'PATCH': items[parts[2]].update({k: v for k, v in body.items() if k in ('text', 'completed')}); commit(); return J(200, {'id': parts[2], **items[parts[2]]})
                        if m == 'DELETE': del items[parts[2]]; commit(); return J(200, {'ok': True})
                    raise ApiError(404, 'unknown list item')
                if head == 'meals':
                    if m == 'GET': return J(200, d.get('settings', {}).get('weeklyMeals', {}))
                    if m in ('PUT', 'PATCH'): cur = d.setdefault('settings', {}).setdefault('weeklyMeals', {}); cur.update(body) if m == 'PATCH' else cur.clear() or cur.update(body); commit(); return J(200, cur)
                if head == 'chores':
                    kid = parts[1] if len(parts) > 1 else None
                    if m == 'GET': return J(200, {k: v.get('items', []) for k, v in d.get('chores', {}).items()} if not kid else d.get('chores', {}).get(kid, {'items': []}))
                    if kid and m == 'PUT': d.setdefault('chores', {})[kid] = {'items': body if isinstance(body, list) else body.get('items', [])}; commit(); return J(200, d['chores'][kid])
                    raise ApiError(405, 'GET, or PUT /chores/{kid}')
                if head == 'events':
                    evs = d.setdefault('events', {})
                    if m == 'GET': return J(200, {'events': [{'id': k, **v} for k, v in evs.items()]})
                    if m == 'POST': i = new_id(); evs[i] = {'summary': body['summary'], 'location': body.get('location', ''), 'description': body.get('description', ''), 'allDay': bool(body.get('allDay', False)), 'start': body['start'], 'end': body['end'], 'updatedAt': now_iso()}; commit(); return J(201, {'id': i, **evs[i]})
                    if len(parts) > 1 and parts[1] in evs:
                        if m in ('PUT', 'PATCH'): evs[parts[1]].update({k: v for k, v in body.items() if k in ('summary', 'location', 'description', 'allDay', 'start', 'end')}); evs[parts[1]]['updatedAt'] = now_iso(); commit(); return J(200, {'id': parts[1], **evs[parts[1]]})
                        if m == 'DELETE': del evs[parts[1]]; commit(); return J(200, {'ok': True})
                    raise ApiError(404, 'unknown event')
        if head == 'state' and m == 'GET':
            try:
                with open(STATE_FILE) as f: return J(200, json.load(f))
            except (OSError, ValueError): return J(200, derive_state(_db_load()))
        if head == 'power' and m == 'GET': return J(200, comed_prices())
        raise ApiError(404, 'unknown route — GET /api/v1 lists them')

    def do_PATCH(self): return self._v1() if self.path.startswith('/api/v1') else self.send_error(404)

    def do_PUT(self):
        if self.path.startswith('/api/v1'): return self._v1()
        if self.path.startswith('/api/db.php'): return self._db()
        if self.path.startswith('/api/state'): return self._state()
        return self.send_error(404)
    def do_DELETE(self):
        if self.path.startswith('/api/v1'): return self._v1()
        return self._db() if self.path.startswith('/api/db.php') else self.send_error(404)

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
        if self.path.startswith('/api/v1'): return self._v1()
        if self.path.startswith('/api/db.php'): return self._db()
        if self.path.startswith('/api/ics.php'): return self._ics_proxy()
        if self.path.split('?')[0] in ('/api/state', '/api/state.php'): return self._state()
        if self.path.startswith('/api/hub.php'): return self._hub()
        if self.path.split('?')[0] in ('/api/power', '/api/power.php'):
            try: return self._json(200, comed_prices())
            except Exception as e: return self._json(502, {'error': str(e)})  # noqa: BLE001
        if self.path.split('?')[0] in ('/', '/index.php', '/index.html'):
            self.path = '/app.html'
        if self.path.startswith('/includes/') or (self.path.startswith('/api/') and not self.path.startswith('/api/v1') and not self.path.split('?')[0] in ('/api/state', '/api/state.php', '/api/power', '/api/power.php')):
            self.send_error(403); return
        return super().do_GET()
    def do_POST(self):
        if self.path.startswith('/api/v1'): return self._v1()
        if self.path.startswith('/api/hub.php'): return self._hub()
        # the ⚙ setup wizard posts the config here (same path as the hosted PHP endpoint)
        if self.path.split('?')[0] not in ('/save-config.php', '/save-config'):
            self.send_error(404); return
        try:
            n = int(self.headers.get('Content-Length', '0')); cfg = json.loads(self.rfile.read(n) or b'{}')
            if not isinstance(cfg, dict) or 'family' not in cfg or 'location' not in cfg: raise ValueError('invalid config')
            clean = {k: cfg[k] for k in ('family', 'location', 'firebase', 'googleClientId', 'holidayCalendarId', 'backend', 'calendars', 'weather', 'house', 'defaultMode', 'defaultTab', 'power') if k in cfg}
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
