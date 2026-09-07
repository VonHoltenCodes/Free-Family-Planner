# Themes: theme packs on top of the CSS tokens

Tracking issue: #4 · Branch: `feat/themes`

## Goal
planner.css already drives everything from :root tokens. Add theme packs and a picker: the current hi-fi default, an LCARS variant, a light 'paper' theme, high-contrast. Themes are token overrides + optional font swaps; no layout changes.

## Design notes
- Every colour in `planner.css` is a `:root` token; a theme is `.canvas.theme-<name>{ --token: … }` plus a few shape rules (LCARS pills/rounded panels, contrast borders).
- Picked per display (`display.theme`), applied as a class on `.canvas` by `applyTheme()`; live preview from the ☰ dialog.
- WeatherStar itself is not themed (it is the real Star4000 look inside its bezel).
- To add a theme: append a block to the THEMES section of `planner.css` and an entry to `THEMES` in `display.js`.

## Checklist
- [x] tokenised remaining hard-coded colours
- [x] Hi-Fi / LCARS / Paper / High-contrast themes
- [x] picker in ☰ Display, per-screen persistence
- [x] README / ROADMAP updated
