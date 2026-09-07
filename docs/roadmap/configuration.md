# Configuration UI: panels, order, clock/units, orientation, per-display settings

Tracking issue: #3 · Branch: `feat/configuration`

## Goal
In-app settings once setup exists: which panels are shown and in what order, chores per kid, week-start day, 12/24h clock, units, portrait/landscape override, screen-dim schedule. Stored per display (localStorage) with optional sync through the data backend.

## Design notes
- `display.js` owns the settings (localStorage `fp.display`), the dialog, the night-dim overlay and `applyLayout()`.
- Portrait layout is computed from the panel order: full-width panels take a row, two adjacent half panels share one, a lone half panel spans both columns. Landscape keeps its fixed arrangement and hands hidden panels' space to neighbours.
- Settings are per display on purpose (a kitchen screen and a hallway screen can differ); sync through the data backend is a later option.
- Chores-per-kid reloads the page (Firestore listeners are bound at boot).

## Checklist
- [x] layout engine for both orientations (overlap-tested)
- [x] settings dialog: panels, chores, week start, clock, units, orientation, night dim
- [x] persistence + reset
- [x] README / ROADMAP updated
