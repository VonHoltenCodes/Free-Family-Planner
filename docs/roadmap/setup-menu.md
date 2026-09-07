# Setup menu: first-run wizard instead of editing config.js

Tracking issue: #2 · Branch: `feat/setup-menu`

## Goal
A ⚙ button opens a first-run wizard: family name + subtitle, kids (name/colour), location search (→ lat/lon), paste Firebase web config + Google client ID, a *Test* button per connection, then write the config. Local-host mode can persist to localStorage (and offer a config.js download); hosted mode needs a small PHP endpoint to write config.js behind the login gate.

## Design notes
- `config-loader.js`: defaults < config.js (dynamic import, tolerant of absence) < localStorage override.
- Modules take config at init (`initStore`, `new GCal({clientId})`, `currentConditions(location)`), so the app boots with no config.js and the wizard opens.
- One save path for both modes: POST `save-config.php` — the PHP file on hosted installs (session-gated), the same route handled by `tools/serve.py` locally. Static hosts fall back to localStorage + a config.js download.
- Kid ids are slugs of the name, kept stable once set so existing chores in Firestore stay attached.

## Checklist
- [x] config loader + module init refactor
- [x] wizard UI (6 steps, tests for NWS / Firestore / Google)
- [x] save endpoints (PHP + serve.py), static fallback
- [x] README / ROADMAP updated
