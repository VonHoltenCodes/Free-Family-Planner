# Roadmap

Free Family Planner ships today as a working wall display with Google Calendar, Firestore
lists and WeatherStar 4000+. Configuration is still a hand-edited `config.js`. These are the
next steps, roughly in order. Each has (or will get) a `feat/<name>` branch and a draft PR;
discussion lives in the linked issue.

| Feature | Branch | What it means |
|---|---|---|
| **Local-host mode** ✅ | `feat/local-host` | `tools/serve.py`, Docker image + compose, systemd units, and Android / Raspberry Pi / Docker kiosk guides in `docs/kiosk/`. |
| **Setup menu** ✅ | `feat/setup-menu` | ⚙ wizard: family, kids, location search + NWS test, Firebase paste + test, Google client check; writes `config.js` server-side (PHP or `serve.py`) or falls back to browser storage + download. Opens itself on first run. |
| **Configuration** ✅ | `feat/configuration` | ☰ Display settings per screen: show/hide + reorder panels (layout engine re-flows both orientations), chores per kid, week start, 12/24h, °F/°C, orientation override, night-dim schedule. Stored in the browser. |
| **Themes** ✅ | `feat/themes` | Four theme packs as token overrides — Hi-Fi (default), LCARS, Paper (light), High contrast — picked per display in ☰ Display. Adding a theme is one CSS block. |
| **Calendar providers** ✅ | `feat/calendar-providers` | Google + any number of read-only **iCal/ICS feeds** (fetched through a session-gated proxy on either server type; recurrence, exclusions, all-day handled) + a writable **local family calendar** stored in the data backend. All shown together, colour-coded. CalDAV deferred. |
| **Data backends** ✅ | `feat/data-backends` | `store.js` is a facade over three backends: Firestore, **self-hosted sync store** (a locked JSON file served by `api/db.php` or `tools/serve.py`, polled every 3 s — no cloud account), and browser-local. Chosen in the ⚙ wizard's Data step. |
| **Weather options** | `feat/weather-options` | WeatherStar display picker (which screens rotate), metric units, and a plain conditions card for outside the US where NWS data does not exist. |
| **Touch & accessibility** | `feat/touch-a11y` | Bigger hit targets for kids, on-screen keyboard friendliness, screen-reader labels, reduced-motion. |

Not planned: accounts, ads, or any hosted service. The whole point is that you own the box it runs on.
