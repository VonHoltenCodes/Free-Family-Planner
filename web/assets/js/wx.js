// Outside temp for the header LCD — straight from api.weather.gov (no key, CORS-open).

async function nws(url) {
  const r = await fetch(url, { headers: { Accept: 'application/geo+json' } });
  if (!r.ok) throw new Error(`NWS ${r.status} for ${url}`);
  return r.json();
}

/* Setup-wizard check: resolve a lat/lon to the NWS point (city, state, station). */
export async function lookupPoint(lat, lon) {
  const pt = await nws(`https://api.weather.gov/points/${lat},${lon}`);
  const rel = pt.properties?.relativeLocation?.properties || {};
  const st = await nws(pt.properties.observationStations);
  const station = st.features?.[0]?.properties?.stationIdentifier;
  if (!station) throw new Error('no observation station');
  return { city: rel.city, state: rel.state, station };
}

async function stationId(lat, lon) {
  const key = `fp.nws.station.${lat},${lon}`;
  const cached = localStorage.getItem(key);
  if (cached) return cached;
  const { station } = await lookupPoint(lat, lon);
  localStorage.setItem(key, station);
  return station;
}

/* Newest observation that carries a temperature: /latest first, then the last few. The NWS often
   publishes a preliminary observation with temperature null, which used to blank the header until
   the next full report. */
async function recentObservation(id) {
  const latest = await nws(`https://api.weather.gov/stations/${id}/observations/latest`);
  if (latest.properties?.temperature?.value != null) return latest.properties;
  const list = await nws(`https://api.weather.gov/stations/${id}/observations?limit=6`);
  return (list.features || []).map((f) => f.properties).find((p) => p?.temperature?.value != null) || null;
}

/* Returns {tempF, cond, station} or throws. */
export async function currentConditions({ lat, lon }) {
  if (lat == null || lon == null) throw new Error('no location configured');
  const id = await stationId(lat, lon);
  const p = await recentObservation(id);
  if (!p) { localStorage.removeItem(`fp.nws.station.${lat},${lon}`); throw new Error('no temperature'); }
  const tempF = Math.round(p.temperature.value * 9 / 5 + 32);
  return { tempF, cond: (p.textDescription || '').toUpperCase(), station: id };
}

export const WS_SCREENS = [
  ['hazards', 'Hazards', true], ['current-weather', 'Current Conditions', true], ['latest-observations', 'Latest Observations', true],
  ['hourly', 'Hourly Forecast', false], ['hourly-graph', 'Hourly Graph', true], ['travel', 'Travel Forecast', false],
  ['regional-forecast', 'Regional Observations', true], ['local-forecast', 'Local Forecast', true], ['extended-forecast', 'Extended Forecast', true],
  ['almanac', 'Almanac', true], ['spc-outlook', 'SPC Outlook', true], ['radar', 'Local Radar', true],
];
export const DEFAULT_WEATHER = { provider: 'auto', screens: Object.fromEntries(WS_SCREENS.map(([id, , on]) => [id, on])), speed: 1, scanLines: false };

/* 'auto' → WeatherStar when the NWS covers the location (cached), else the Open-Meteo card. */
export async function resolveProvider(weather, loc) {
  const p = weather?.provider || 'auto';
  if (p !== 'auto') return p;
  if (loc.lat == null) return 'card';
  const key = `fp.wx.nws.${loc.lat},${loc.lon}`; const cached = localStorage.getItem(key);
  if (cached) return cached === 'ok' ? 'weatherstar' : 'card';
  try { await lookupPoint(loc.lat, loc.lon); localStorage.setItem(key, 'ok'); return 'weatherstar'; }
  catch { localStorage.setItem(key, 'no'); return 'card'; }
}
export function weatherStarUrl(loc, weather, units) {
  const latLon = encodeURIComponent(JSON.stringify({ lat: loc.lat, lon: loc.lon }));
  const p = new URLSearchParams({ 'settings-kiosk-checkbox': 'true', 'settings-units-select': units || 'us', 'settings-speed-select': String(weather?.speed ?? 1), 'settings-scanLines-checkbox': String(!!weather?.scanLines) });
  WS_SCREENS.forEach(([id, , on]) => p.set(`${id}-checkbox`, String(weather?.screens?.[id] ?? on)));
  return `ws4kp/index.html?${p.toString()}&latLon=${latLon}&v=7`;
}
