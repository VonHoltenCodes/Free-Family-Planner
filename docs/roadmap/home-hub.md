# Home hub interop (Home Assistant first, Home-IO second)

Tracking issue: #19 · Branch: `feat/home-hub`

## Goal
Make the planner a good citizen of the home: readable by the hub as sensors, sharing the shopping
list with it, and showing a few house states on the wall. One adapter interface; Home Assistant is
the first implementation, our own local-first [Home-IO](https://github.com/VonHoltenCodes/home-io)
the second.

## Pieces (ship in this order)
1. **`GET /api/state`** on the server (serve.py + `api/state.php`): `{ meals: {today, week}, shopping: {open, items}, chores: {kid: {done, total}}, events: [next 5], updatedAt }`. Read-only, no token, LAN-only by default (hosted: session-gated). Document the Home Assistant `rest` sensor YAML in `docs/hub/home-assistant.md`.
2. **Shopping-list sync** — the server pushes/pulls against the hub's to-do list (HA: `todo.get_items` / `todo.add_item` / `todo.update_item` services on `todo.shopping_list`). Conflict rule: the hub is the source of truth for existence, the planner for `completed`; poll every 15 s alongside the sync-store revision.
3. **House panel** — a new `p-house` panel (registers with the layout engine like the others): entity tiles picked in a wizard "Home hub" step (entity search from `listEntities()`). Read-only v1; a "tap to toggle" whitelist later.

## Adapter interface (server-side, Python for serve.py, PHP mirror for hosted)
```
listEntities() -> [{id, name, domain, unit}]
getStates(ids) -> {id: {state, attrs, updated}}
todoList()/todoAdd(text)/todoComplete(id, done)
call(service, data)              # later, for toggles
```
- **Home Assistant**: REST API with a long-lived access token. `/api/states`, `/api/services/<domain>/<service>`, todo via `todo.get_items` (service call with `return_response`).
- **Home-IO**: `GET /api/devices` (Device model: id, name, type, state), `POST /api/devices/{id}/command`, `/api/thermostats`, `/api/smart_plugs`; no todo list yet — the planner could *be* Home-IO's list (Home-IO polls our `/api/state`).

## Security
- Hub URL + token live in the server-only folder (`includes/hub.json` on hosted, `data/hub.json` locally), written by the wizard through the existing save endpoints, never in `config.js`.
- The browser only ever talks to our server (`api/hub.php?op=…`); the server talks to the hub.
- Hosted installs: feature stays hidden unless a hub URL is configured and reachable from the server.

## Open questions
- Push instead of poll? HA webhooks → our `/api/db.php` would need a shared secret; poll is fine for v1.
- Which entity domains to allow in the House panel v1: `climate`, `binary_sensor`, `sensor`, `person`, `lock`, `switch`.
- MQTT as a third adapter (Home-IO already runs a broker) — probably v2.

## Checklist
- [ ] design agreed in #19
- [ ] `/api/state` + HA sensor docs
- [ ] hub adapter interface + Home Assistant adapter (serve.py + PHP)
- [ ] shopping-list sync
- [ ] House panel + wizard step
- [ ] Home-IO adapter
- [ ] README / ROADMAP / docs/hub
