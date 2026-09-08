# Home Assistant: House panel and shopping-list sync

Beyond the [sensors](home-assistant.md) the planner exposes, it can also read *from* your hub.

## Connect the hub
⚙ Setup → **Home hub** step → pick Home Assistant → enter the address (a LAN address is fine, the
*server* talks to it) and a **long-lived access token** (Home Assistant → your profile → Security →
Long-lived access tokens) → *Save hub & test*. The address and token are stored on the server in the
same private folder as the login hash (`data/hub.json` locally, `includes/data/hub.json` hosted) —
they are never put in `config.js`, and the browser only ever talks to your own server.

Home-IO works the same way (devices become tiles; it has no to-do list).

## House panel
After the test succeeds the step lists your entities. Click to add tiles, rename them, remove them.
Supported kinds, inferred automatically:

| Entity | Tile shows |
|---|---|
| `climate.*` | current temperature, set point, heating/cooling/idle |
| `binary_sensor.*` door / garage / window | OPEN (amber) / CLOSED |
| `binary_sensor.*` motion / occupancy | MOTION / CLEAR |
| `person.*`, `device_tracker.*` | HOME / AWAY |
| `lock.*` | LOCKED / UNLOCKED (amber) |
| `switch.*`, `light.*`, `input_boolean.*` | ON / OFF (+ brightness) |
| `cover.*` | OPEN / CLOSED |
| `camera.*` | a live still, refreshed every 15 s (through your server, token never in the page) |
| `media_player.*` | PLAYING / PAUSED / OFF and what is playing |
| `fan.*` | ON / OFF |
| `sensor.*`, anything else | value with its unit |

Tiles refresh every 15 s. The panel appears once at least one tile is picked; order and visibility
follow ☰ Display like every other panel.

**Tap to control:** in the wizard, tiles for lights, switches, fans, covers and locks have a *Tap to control*
toggle (on by default for lights, switches, fans and covers; off for locks). Lights/switches/fans toggle,
covers open or close, locks ask for confirmation first. On the **Command** screen the House panel is
full width with bigger tiles; see the README on Family / Command screens.

## Home Assistant calendars
With the hub connected, the wizard's **Calendars** step lists every calendar Home Assistant has
(`calendar.*` entities — Google, iCloud/CalDAV, local, whatever you set up there). Switch one on and its
events show on the grid and the week strip, colour-coded and read-only, fetched through your server.

## Shopping-list sync
Home Assistant's built-in **Shopping list** (`todo.shopping_list`) is what voice assistants feed.
Turn on ☰ Display → *Hub shopping sync* on **one** screen (the wall display). Every 20 s that screen:
- adds items that exist on one side to the other,
- copies completion in whichever direction changed since the last sync (the hub wins a tie),
- deletes on one side what was deleted on the other.

Items are matched by text; pairs are remembered by that screen, so keep the sync on a single
always-on screen. A different to-do entity can be set in the Home hub step.

## Not a family? Use it as a home dashboard
Skip kids and meals in the wizard, hide any panel in ☰ Display, and you have a wall dashboard:
calendar, WeatherStar, House tiles, notes. The header title is whatever you type.

## Verified against
Home Assistant 2026.9.1 (container) with the demo platform: thermostats, locks, covers, lights, motion,
sensors, weather, and the built-in Shopping list in both directions.

## Testing without a real Home Assistant
`python3 tools/fake-ha.py` runs a stand-in on port 8123 (token `test-token`) with a handful of
entities and a shopping list. Point the Home hub step at `http://127.0.0.1:8123`.
