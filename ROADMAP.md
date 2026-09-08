# Roadmap

The first roadmap is complete (everything marked ✅ is merged). New ideas go in Issues; each feature
still gets a `feat/<name>` branch and a PR.

## Next up

| Feature | Branch | What it means |
|---|---|---|
| **Desktop app (Windows / macOS)** | `feat/desktop-app` | Serve the planner from a home PC with no Docker or terminal: a tray / menu-bar app bundling `serve.py` + Python, shows the LAN address and a QR code, autostarts at login, optional "show it on this PC" window. Signed installers via the existing Azure Trusted Signing (Windows) and Developer ID + notarization (macOS) pipelines. Issue #17. |
| **Home hub interop** ✅ | `feat/home-hub` | Generic hub adapter, Home Assistant first, Home-IO second: the planner exposed as sensors (`/api/state`), two-way shopping-list sync with the hub's to-do list, and a read-only House panel (thermostat, doors, who's home). Hub token stays server-side. Issue #19. ✅ **Shipped:** `/api/state` + HA sensor docs, House panel with configurable tiles, two-way shopping-list sync, Home Assistant + Home-IO adapters, `tools/fake-ha.py` for testing. |

## Shipped in v0.1.0

| Feature | Branch | What it means |
|---|---|---|
| **Local-host mode** ✅ | `feat/local-host` | `tools/serve.py`, Docker image + compose, systemd units, and Android / Raspberry Pi / Docker kiosk guides in `docs/kiosk/`. |
| **Setup menu** ✅ | `feat/setup-menu` | ⚙ wizard: family, kids, location search + NWS test, Firebase paste + test, Google client check; writes `config.js` server-side (PHP or `serve.py`) or falls back to browser storage + download. Opens itself on first run. |
| **Configuration** ✅ | `feat/configuration` | ☰ Display settings per screen: show/hide + reorder panels (layout engine re-flows both orientations), chores per kid, week start, 12/24h, °F/°C, orientation override, night-dim schedule. Stored in the browser. |
| **Themes** ✅ | `feat/themes` | Four theme packs as token overrides — Hi-Fi (default), LCARS, Paper (light), High contrast — picked per display in ☰ Display. Adding a theme is one CSS block. |
| **Calendar providers** ✅ | `feat/calendar-providers` | Google + any number of read-only **iCal/ICS feeds** (fetched through a session-gated proxy on either server type; recurrence, exclusions, all-day handled) + a writable **local family calendar** stored in the data backend. All shown together, colour-coded. CalDAV deferred. |
| **Data backends** ✅ | `feat/data-backends` | `store.js` is a facade over three backends: Firestore, **self-hosted sync store** (a locked JSON file served by `api/db.php` or `tools/serve.py`, polled every 3 s — no cloud account), and browser-local. Chosen in the ⚙ wizard's Data step. |
| **Weather options** ✅ | `feat/weather-options` | Wizard Weather step: pick which WeatherStar screens rotate, speed, scan lines; provider Auto/WeatherStar/card. Outside NWS coverage the panel becomes an **Open-Meteo conditions + 5-day card** in the Star4000 look (auto-detected, worldwide). °C/°F follow the display setting. |
| **Touch & accessibility** ✅ | `feat/touch-a11y` | Bigger hit targets in portrait, keyboard focus rings and Enter/Space on grid cells and event cards, ARIA regions/switches/dialog/live toast, `prefers-reduced-motion`, and an on-screen-keyboard guard that slides the canvas instead of re-scaling it. |

Not planned: accounts, ads, or any hosted service. The whole point is that you own the box it runs on.
