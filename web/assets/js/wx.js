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

/* Returns {tempF, cond, station} or throws. */
export async function currentConditions({ lat, lon }) {
  if (lat == null || lon == null) throw new Error('no location configured');
  const id = await stationId(lat, lon);
  const ob = await nws(`https://api.weather.gov/stations/${id}/observations/latest`);
  const p = ob.properties || {};
  let c = p.temperature?.value;
  if (c == null) { localStorage.removeItem(`fp.nws.station.${lat},${lon}`); throw new Error('no temperature'); }
  const tempF = Math.round(c * 9 / 5 + 32);
  return { tempF, cond: (p.textDescription || '').toUpperCase(), station: id };
}
