# Weather options: screen picker, metric units, non-US conditions card

Tracking issue: #7 · Branch: `feat/weather-options`

## Goal
Pick which WeatherStar screens rotate, metric units, and a plain conditions card for locations outside the US where the NWS feed does not exist (Open-Meteo).

## Design notes
- `wx.js` builds the WeatherStar kiosk URL from `config.weather` (`<screen>-checkbox`, `settings-speed-select`, `settings-scanLines-checkbox`, units) and resolves the provider: `auto` tries the NWS point lookup once (cached per lat/lon) and falls back to the card.
- `wx-card.js`: Open-Meteo current + daily, WMO weather codes mapped to the bundled Star4000 icons, rotating conditions ↔ 5-day faces every 12 s. Header temperature comes from the same source.
- Location search in the wizard has a US-only toggle (ArcGIS geocoder without the country filter for the rest of the world); the test button reports which provider the place will get.

## Checklist
- [x] screen picker, speed, scan lines
- [x] Open-Meteo card + auto provider (tested with Toronto)
- [x] README / ROADMAP updated
