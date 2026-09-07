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
| **Themes** | `feat/themes` | Theme packs on top of the CSS tokens: the current hi-fi default, an LCARS variant, a light "paper" theme, high-contrast. Theme picker in configuration. |
| **Calendar providers** | `feat/calendar-providers` | Beyond Google: read-only ICS/iCal URLs (iCloud, Outlook, school calendars), CalDAV, and a purely local calendar for the no-cloud install. |
| **Data backends** | `feat/data-backends` | Beyond Firestore: browser-local storage for a single display, and a tiny self-hosted sync server (SQLite) so phones and the wall stay in sync without Google. |
| **Weather options** | `feat/weather-options` | WeatherStar display picker (which screens rotate), metric units, and a plain conditions card for outside the US where NWS data does not exist. |
| **Touch & accessibility** | `feat/touch-a11y` | Bigger hit targets for kids, on-screen keyboard friendliness, screen-reader labels, reduced-motion. |

Not planned: accounts, ads, or any hosted service. The whole point is that you own the box it runs on.
