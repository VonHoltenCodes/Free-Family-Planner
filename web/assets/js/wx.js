// Outside temp for the header LCD — straight from api.weather.gov (no key, CORS-open).
import config from '../../config.js';

const { lat: LAT, lon: LON } = config.location;
const KEY = `fp.nws.station.${LAT},${LON}`;

async function nws(url) {
  const r = await fetch(url, { headers: { Accept: 'application/geo+json' } });
  if (!r.ok) throw new Error(`NWS ${r.status} for ${url}`);
  return r.json();
}

async function stationId() {
  const cached = localStorage.getItem(KEY);
  if (cached) return cached;
  const pt = await nws(`https://api.weather.gov/points/${LAT},${LON}`);
  const st = await nws(pt.properties.observationStations);
  const id = st.features?.[0]?.properties?.stationIdentifier;
  if (!id) throw new Error('no observation station');
  localStorage.setItem(KEY, id);
  return id;
}

/* Returns {tempF, cond, station} or throws. */
export async function currentConditions() {
  const id = await stationId();
  const ob = await nws(`https://api.weather.gov/stations/${id}/observations/latest`);
  const p = ob.properties || {};
  let c = p.temperature?.value;
  if (c == null) { localStorage.removeItem(KEY); throw new Error('no temperature'); }
  const tempF = Math.round(c * 9 / 5 + 32);
  return { tempF, cond: (p.textDescription || '').toUpperCase(), station: id };
}
