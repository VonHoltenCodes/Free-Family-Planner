# API

Everything the wizard and the wall can do, you can do from a terminal, a script, or an agent.
Same routes on both servers:

| Install | Base URL | Auth |
|---|---|---|
| Local-host / Docker / desktop (`tools/serve.py`) | `http://<host>:8765/api/v1` | none on the LAN, **or** put a secret in `data/api-token` and send `Authorization: Bearer <secret>` |
| Hosted (PHP) | `https://<site>/family-planner/api/v1` | the site login session, **or** `Authorization: Bearer <FP_API_TOKEN>` (set in `includes/auth_config.php`) |

`GET /api/v1` lists the routes. All bodies and responses are JSON. Errors are `{"error": "…"}` with a
4xx/5xx status. A `?token=` query parameter works where headers are awkward.

## The CLI
`tools/ffp` is a stdlib-only Python client for all of it:
```sh
tools/ffp --url http://planner.local:8765 save-config            # remembers url/token in ~/.config/ffp
ffp routes
ffp config get family.title            ffp config set family.title "THE SMITHS"
ffp hub set --type homeassistant --url http://homeassistant.local:8123 --token <HA long-lived token>
ffp hub test                           ffp hub entities --domain light
ffp tiles add light.kitchen --label "Kitchen" --control
ffp list shopping add "Milk"           ffp meals set Tuesday "Tacos"
ffp events add "Dentist" 2026-09-10    ffp hub call lock.front_door lock
ffp state                              ffp power
```
Hosted installs: `ffp --url https://site/family-planner --token <FP_API_TOKEN> …`, or `ffp login <user>` once
to use the site login (cookie saved in `~/.config/ffp`).

## Routes

### Site config (`config.js`)
| | |
|---|---|
| `GET /config` | the whole config (family, location, backend, calendars, weather, house, power, defaultTab…) |
| `PATCH /config` | deep-merge a partial object, e.g. `{"power":{"warnAbove":9}}` |
| `PUT /config` | replace it |

Keys and shapes are exactly those in [`web/config.example.js`](../web/config.example.js).

### House tiles (`config.house.tiles`)
| | |
|---|---|
| `GET /tiles` | `{"tiles":[{entity,label,kind?,control?}]}` |
| `POST /tiles` | add or replace one tile: `{"entity":"light.kitchen","label":"Kitchen","control":true}` (kind is inferred if omitted) |
| `PUT /tiles` | replace the list |
| `DELETE /tiles/{entity}` | remove one |

### Home hub (Home Assistant / Home-IO)
| | |
|---|---|
| `GET /hub` | `{type,url,hasToken,todoEntity}` — the token is never returned |
| `PATCH /hub` | `{"type":"homeassistant","url":"http://…:8123","token":"…","todoEntity":"todo.shopping_list"}` (any subset) |
| `GET /hub/test` | reachability + hub name/version |
| `GET /hub/entities[?domain=light]` | usable entities `{id,name,domain,deviceClass,unit,state}` |
| `GET /hub/states?ids=a,b` | current states with the attributes tiles use |
| `POST /hub/call` | `{"entity":"light.kitchen","action":"toggle"}` — actions: `toggle` `turn_on` `turn_off` `lock` `unlock` `open` `close` `snapshot` (cameras: take a fresh picture) |
| `GET /hub/calendars` | the hub's calendars |
| `GET` / `POST {"text"}` / `PATCH {"uid","completed"}` / `DELETE {"uid"}` `/hub/todo` | the hub's shopping to-do list |

### Data (self-hosted sync store)
These read and write the server's own store, so they apply to installs whose data backend is
**self-hosted** (`backend: "sync"`). Firestore-backed installs keep their data in Google's cloud;
use the Firebase tooling for those.

| | |
|---|---|
| `GET /lists/shopping` · `GET /lists/notes` | `{"items":[{id,text,completed,createdAt}]}` |
| `POST /lists/{col}` | `{"text":"Milk"}` |
| `PATCH /lists/{col}/{id}` | `{"completed":true}` or `{"text":"…"}` |
| `DELETE /lists/{col}/{id}` | |
| `GET` / `PUT` / `PATCH` `/meals` | `{"Monday":"…","Tuesday":"…",…}` |
| `GET /chores` · `GET /chores/{kid}` · `PUT /chores/{kid}` | `[{id,text,completed}]` |
| `GET /events` · `POST /events` · `PUT|PATCH|DELETE /events/{id}` | local family calendar: `{summary,location,description,allDay,start,end}`; dates `YYYY-MM-DD` for all-day, ISO datetimes otherwise |

### Read-only feeds
| | |
|---|---|
| `GET /state` | what the wall shows — meals, lists, chores, next events, weather, electricity, plus the display's viewport diagnostics (also at `/api/state` for Home Assistant's REST sensor, see [hub/home-assistant.md](hub/home-assistant.md)) |
| `GET /power` | ComEd hourly pricing: current, 5-minute, today's and tomorrow's day-ahead hours |

## Notes
- Display settings (theme, panel order, night dim, which tab is active) are **per screen** and live in that browser, not on the server, so they are not in the API. `defaultTab` in the config sets where new screens start.
- Changing the config through the API takes effect when the wall reloads. The wall reloads itself after wizard saves; for API changes, reload the page (or wait for the next daily rollover).
- The older page endpoints (`api/hub.php?op=…`, `api/db.php`, `save-config.php`) still exist for the page itself; new integrations should use `/api/v1`.
