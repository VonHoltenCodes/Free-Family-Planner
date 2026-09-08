#!/usr/bin/env python3
"""A tiny fake Home Assistant for testing the hub adapter without a real HA:
   python3 tools/fake-ha.py --port 8123      (token: "test-token")
Implements /api/, /api/config, /api/states, and the todo services (get/add/update/remove_item)."""
import argparse, http.server, json, itertools
TOKEN = 'test-token'
STATES = [
  {'entity_id': 'climate.hallway', 'state': 'heat', 'attributes': {'friendly_name': 'Hallway Thermostat', 'current_temperature': 71, 'temperature': 70, 'hvac_action': 'idle', 'unit_of_measurement': '°F'}},
  {'entity_id': 'binary_sensor.front_door', 'state': 'off', 'attributes': {'friendly_name': 'Front Door', 'device_class': 'door'}},
  {'entity_id': 'binary_sensor.garage_door', 'state': 'on', 'attributes': {'friendly_name': 'Garage Door', 'device_class': 'garage_door'}},
  {'entity_id': 'person.trent', 'state': 'home', 'attributes': {'friendly_name': 'Trent'}},
  {'entity_id': 'person.lisa', 'state': 'not_home', 'attributes': {'friendly_name': 'Lisa'}},
  {'entity_id': 'sensor.basement_humidity', 'state': '48', 'attributes': {'friendly_name': 'Basement Humidity', 'unit_of_measurement': '%', 'device_class': 'humidity'}},
  {'entity_id': 'switch.porch_light', 'state': 'on', 'attributes': {'friendly_name': 'Porch Light'}},
  {'entity_id': 'lock.back_door', 'state': 'locked', 'attributes': {'friendly_name': 'Back Door Lock'}},
  {'entity_id': 'sensor.not_shown', 'state': '1', 'attributes': {}},
  {'entity_id': 'automation.x', 'state': 'on', 'attributes': {}},
]
TODO = {'todo.shopping_list': [{'uid': 'u1', 'summary': 'Eggs', 'status': 'needs_action'}, {'uid': 'u2', 'summary': 'Coffee', 'status': 'completed'}]}
ids = itertools.count(100)
class H(http.server.BaseHTTPRequestHandler):
    def _j(self, code, obj): b = json.dumps(obj).encode(); self.send_response(code); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(b))); self.end_headers(); self.wfile.write(b)
    def _auth(self):
        if self.headers.get('Authorization') != f'Bearer {TOKEN}': self._j(401, {'message': 'Unauthorized'}); return False
        return True
    def do_GET(self):
        if not self._auth(): return
        p = self.path.split('?')[0]
        if p == '/api/': return self._j(200, {'message': 'API running.'})
        if p == '/api/config': return self._j(200, {'location_name': 'Test House', 'version': '2026.9.0'})
        if p == '/api/states': return self._j(200, STATES)
        self._j(404, {'message': 'not found'})
    def do_POST(self):
        if not self._auth(): return
        p = self.path.split('?')[0]; body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0)) or b'{}'))
        lst = TODO.setdefault(body.get('entity_id', 'todo.shopping_list'), [])
        if p == '/api/services/todo/get_items': return self._j(200, {'changed_states': [], 'service_response': {body['entity_id']: {'items': lst}}})
        if p == '/api/services/todo/add_item': lst.append({'uid': f'u{next(ids)}', 'summary': body['item'], 'status': 'needs_action'}); return self._j(200, [])
        if p == '/api/services/todo/update_item':
            for i in lst:
                if i['uid'] == body['item'] or i['summary'] == body['item']: i['status'] = body.get('status', i['status'])
            return self._j(200, [])
        if p == '/api/services/todo/remove_item':
            rm = set(body['item'] if isinstance(body['item'], list) else [body['item']]); lst[:] = [i for i in lst if i['uid'] not in rm and i['summary'] not in rm]; return self._j(200, [])
        self._j(404, {'message': 'not found'})
    def log_message(self, *a): pass
if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--port', type=int, default=8123); a = ap.parse_args()
    print(f'fake Home Assistant on http://127.0.0.1:{a.port}  token={TOKEN}'); http.server.ThreadingHTTPServer(('127.0.0.1', a.port), H).serve_forever()
