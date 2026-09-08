"""Home hub adapters used by tools/serve.py (mirrored in web/api/hub.php for hosted installs).
The hub URL + token live in data/hub.json (never in config.js, which the browser can read).

  homeassistant: REST API with a long-lived access token
  homeio:        Home-IO (github.com/VonHoltenCodes/home-io) device API — no to-do list
"""
import json, urllib.request, urllib.error

DOMAINS = ('camera', 'media_player', 'fan', 'alarm_control_panel', 'climate', 'sensor', 'binary_sensor', 'person', 'lock', 'switch', 'light', 'cover', 'weather', 'device_tracker', 'input_boolean')

class HubError(Exception): pass

def _req(method, url, token=None, body=None, timeout=10):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read(); return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e: raise HubError(f'hub HTTP {e.code}: {e.read()[:120].decode(errors="replace")}')
    except Exception as e: raise HubError(f'hub unreachable: {e}')  # noqa: BLE001

class HomeAssistant:
    name = 'homeassistant'
    def __init__(self, cfg): self.url = cfg['url'].rstrip('/'); self.token = cfg.get('token', ''); self.todo = cfg.get('todoEntity') or 'todo.shopping_list'
    def test(self):
        r = _req('GET', f'{self.url}/api/', self.token); cfg = _req('GET', f'{self.url}/api/config', self.token)
        return f"{r.get('message', 'ok')} — {cfg.get('location_name', 'Home Assistant')} {cfg.get('version', '')}".strip()
    def entities(self):
        out = []
        for s in _req('GET', f'{self.url}/api/states', self.token):
            eid = s.get('entity_id', ''); dom = eid.split('.')[0]
            if dom not in DOMAINS: continue
            a = s.get('attributes', {})
            out.append({'id': eid, 'name': a.get('friendly_name', eid), 'domain': dom, 'deviceClass': a.get('device_class'), 'unit': a.get('unit_of_measurement'), 'state': s.get('state')})
        return sorted(out, key=lambda e: e['name'].lower())
    def states(self, ids):
        want = set(ids); out = {}
        for s in _req('GET', f'{self.url}/api/states', self.token):
            if s.get('entity_id') in want:
                a = s.get('attributes', {})
                out[s['entity_id']] = {'state': s.get('state'), 'unit': a.get('unit_of_measurement'), 'name': a.get('friendly_name'), 'deviceClass': a.get('device_class'),
                                       'attrs': {k: a[k] for k in ('temperature', 'current_temperature', 'hvac_action', 'target_temp_high', 'target_temp_low', 'brightness', 'battery_level', 'media_title', 'media_artist', 'source', 'percentage', 'thumbnail', 'motion_enabled', 'motion_detected', 'battery', 'last_record', 'brand') if k in a}, 'updated': s.get('last_updated')}
        return out
    ACTIONS = {'toggle': None, 'turn_on': None, 'turn_off': None, 'lock': 'lock', 'unlock': 'lock', 'open': 'cover', 'close': 'cover'}
    def call(self, entity, action):
        dom = entity.split('.')[0]
        svc = {'toggle': (dom if dom in ('light', 'switch', 'input_boolean', 'fan') else 'homeassistant', 'toggle'), 'turn_on': (dom, 'turn_on'), 'turn_off': (dom, 'turn_off'),
               'lock': ('lock', 'lock'), 'unlock': ('lock', 'unlock'), 'open': ('cover', 'open_cover'), 'close': ('cover', 'close_cover')}.get(action)
        if action == 'snapshot':
            if dom != 'camera': raise HubError('snapshot is for cameras')
            _req('POST', f'{self.url}/api/services/blink/trigger_camera', self.token, {'entity_id': entity})   # Blink: take a fresh picture
            import time, threading
            def poke():   # Blink's poll is 5 min; ask HA to re-read this camera a few times so the new thumbnail lands quickly
                for delay in (6, 12, 20):
                    time.sleep(delay)
                    try: _req('POST', f'{self.url}/api/services/homeassistant/update_entity', self.token, {'entity_id': entity})
                    except HubError: pass
            threading.Thread(target=poke, daemon=True).start(); return True
        if not svc: raise HubError(f'unknown action {action}')
        _req('POST', f'{self.url}/api/services/{svc[0]}/{svc[1]}', self.token, {'entity_id': entity}); return True
    def calendars(self):
        try: cs = _req('GET', f'{self.url}/api/calendars', self.token)
        except HubError as e:
            if '404' in str(e): return []   # HA without any calendar entities answers 404
            raise
        return [{'id': c['entity_id'], 'name': c.get('name', c['entity_id'])} for c in cs]
    def cal_events(self, entity, start, end):
        from urllib.parse import quote
        return _req('GET', f'{self.url}/api/calendars/{entity}?start={quote(start)}&end={quote(end)}', self.token)
    def camera(self, entity):
        req = urllib.request.Request(f'{self.url}/api/camera_proxy/{entity}', headers={'Authorization': f'Bearer {self.token}'})
        try:
            with urllib.request.urlopen(req, timeout=15) as r: return r.headers.get('Content-Type', 'image/jpeg'), r.read()
        except Exception as e: raise HubError(f'camera: {e}')  # noqa: BLE001
    def todo_list(self):
        r = _req('POST', f'{self.url}/api/services/todo/get_items?return_response', self.token, {'entity_id': self.todo})
        items = (r.get('service_response') or {}).get(self.todo, {}).get('items', [])
        return [{'uid': i.get('uid'), 'text': i.get('summary', ''), 'completed': i.get('status') == 'completed'} for i in items]
    def todo_add(self, text): _req('POST', f'{self.url}/api/services/todo/add_item', self.token, {'entity_id': self.todo, 'item': text}); return True
    def todo_set(self, uid, completed): _req('POST', f'{self.url}/api/services/todo/update_item', self.token, {'entity_id': self.todo, 'item': uid, 'status': 'completed' if completed else 'needs_action'}); return True
    def todo_remove(self, uid): _req('POST', f'{self.url}/api/services/todo/remove_item', self.token, {'entity_id': self.todo, 'item': [uid]}); return True

class HomeIO:
    name = 'homeio'
    def __init__(self, cfg): self.url = cfg['url'].rstrip('/'); self.token = cfg.get('token', '')
    def test(self): d = _req('GET', f'{self.url}/api/devices', self.token); return f'Home-IO reachable — {len(d)} devices'
    def _map(self, d):
        t = (d.get('type') or d.get('device_type') or 'sensor').lower(); dom = 'climate' if 'thermo' in t else 'switch' if 'plug' in t or 'switch' in t else 'binary_sensor' if 'door' in t or 'motion' in t else 'sensor'
        st = d.get('state') if not isinstance(d.get('state'), dict) else (d['state'].get('value') or d['state'].get('temperature') or d['state'].get('on'))
        return {'id': f"homeio.{d.get('id')}", 'name': d.get('name', d.get('id')), 'domain': dom, 'deviceClass': t, 'unit': d.get('unit'), 'state': st, 'attrs': d.get('state') if isinstance(d.get('state'), dict) else {}}
    def entities(self): return sorted([self._map(d) for d in _req('GET', f'{self.url}/api/devices', self.token)], key=lambda e: e['name'].lower())
    def states(self, ids): return {e['id']: {'state': e['state'], 'unit': e['unit'], 'name': e['name'], 'deviceClass': e['deviceClass'], 'attrs': e['attrs'], 'updated': None} for e in self.entities() if e['id'] in set(ids)}
    def call(self, entity, action):
        dev = entity.split('.', 1)[1]; cmd = {'toggle': 'toggle', 'turn_on': 'on', 'turn_off': 'off', 'lock': 'lock', 'unlock': 'unlock', 'open': 'open', 'close': 'close'}.get(action)
        if not cmd: raise HubError(f'unknown action {action}')
        _req('POST', f'{self.url}/api/devices/{dev}/command', self.token, {'command': cmd}); return True
    def calendars(self): return []
    def cal_events(self, entity, start, end): return []
    def camera(self, entity): raise HubError('Home-IO has no cameras')
    def todo_list(self): raise HubError('Home-IO has no to-do list')
    todo_add = todo_set = todo_remove = todo_list

def make(cfg):
    t = (cfg or {}).get('type')
    if t == 'homeassistant': return HomeAssistant(cfg)
    if t == 'homeio': return HomeIO(cfg)
    raise HubError('no hub configured')
