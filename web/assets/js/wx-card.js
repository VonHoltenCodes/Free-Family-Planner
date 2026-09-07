// Conditions card for places the National Weather Service does not cover (anywhere outside the
// US): Open-Meteo, free, no key, CORS-open. Rendered in the WeatherStar bezel in the Star4000 look.
const WMO = {
  0: ['Clear', 'Sunny', 'Clear'], 1: ['Mostly Clear', 'Mostly-Clear', 'Clear'], 2: ['Partly Cloudy', 'Partly-Cloudy', 'Partly-Cloudy'], 3: ['Cloudy', 'Cloudy', 'Cloudy'],
  45: ['Fog', 'Fog', 'Fog'], 48: ['Freezing Fog', 'Fog', 'Fog'], 51: ['Light Drizzle', 'Shower', 'Shower'], 53: ['Drizzle', 'Shower', 'Shower'], 55: ['Heavy Drizzle', 'Rain', 'Rain'],
  56: ['Freezing Drizzle', 'Freezing-Rain', 'Freezing-Rain'], 57: ['Freezing Drizzle', 'Freezing-Rain', 'Freezing-Rain'], 61: ['Light Rain', 'Shower', 'Shower'], 63: ['Rain', 'Rain', 'Rain'], 65: ['Heavy Rain', 'Rain', 'Rain'],
  66: ['Freezing Rain', 'Freezing-Rain', 'Freezing-Rain'], 67: ['Freezing Rain', 'Freezing-Rain', 'Freezing-Rain'], 71: ['Light Snow', 'Light-Snow', 'Light-Snow'], 73: ['Snow', 'Heavy-Snow', 'Heavy-Snow'], 75: ['Heavy Snow', 'Heavy-Snow', 'Heavy-Snow'],
  77: ['Snow Grains', 'Light-Snow', 'Light-Snow'], 80: ['Showers', 'Shower', 'Shower'], 81: ['Showers', 'Rain', 'Rain'], 82: ['Heavy Showers', 'Rain', 'Rain'], 85: ['Snow Showers', 'Light-Snow', 'Light-Snow'], 86: ['Snow Showers', 'Heavy-Snow', 'Heavy-Snow'],
  95: ['Thunderstorm', 'Thunderstorm', 'Thunderstorm'], 96: ['T-Storm w/ Hail', 'Thunderstorm', 'Thunderstorm'], 99: ['T-Storm w/ Hail', 'Thunderstorm', 'Thunderstorm'],
};
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const wmo = (code, isDay) => { const w = WMO[code] || ['—', 'No-Data', 'No-Data']; return { text: w[0], icon: `ws4kp/images/icons/current-conditions/${isDay ? w[1] : w[2]}.gif` }; };
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export async function fetchOpenMeteo({ lat, lon }, units = 'us') {
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  Object.entries({ latitude: lat, longitude: lon, current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max', forecast_days: 6, timezone: 'auto',
    temperature_unit: units === 'metric' ? 'celsius' : 'fahrenheit', wind_speed_unit: units === 'metric' ? 'kmh' : 'mph' }).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { cache: 'no-store' }); if (!r.ok) throw new Error(`Open-Meteo ${r.status}`);
  return r.json();
}
export async function openMeteoConditions(loc, units) {
  const d = await fetchOpenMeteo(loc, units); const c = d.current;
  return { temp: Math.round(c.temperature_2m), cond: wmo(c.weather_code, c.is_day).text.toUpperCase(), tempF: units === 'metric' ? Math.round(c.temperature_2m * 9 / 5 + 32) : Math.round(c.temperature_2m) };
}
const dir = (deg) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];

/* Renders into `host` (the bezel). Rotates conditions ↔ 5-day forecast every 12 s like the Star4000. */
export function mountCard(host, loc, label, units) {
  host.innerHTML = ''; const card = el('div', 'wxcard'); host.appendChild(card);
  const head = el('div', 'wx-head'); const ttl = el('span', 'wx-title', 'CURRENT CONDITIONS'); head.appendChild(ttl); card.appendChild(head);
  const body = el('div', 'wx-body'); const fc = el('div', 'wx-fc'); fc.hidden = true; card.append(body, fc);
  card.appendChild(el('div', 'wx-place', (label || '').toUpperCase()));
  let face = 0; let data = null;
  const draw = () => {
    if (!data) return; const c = data.current; const w = wmo(c.weather_code, c.is_day); const tu = units === 'metric' ? '°C' : '°F'; const su = units === 'metric' ? 'KM/H' : 'MPH';
    body.innerHTML = ''; const left = el('div', 'wx-left'); left.appendChild(el('div', 'wx-temp', `${Math.round(c.temperature_2m)}°`)); left.appendChild(el('div', 'wx-cond', w.text.toUpperCase()));
    const img = el('img', 'wx-icon'); img.src = w.icon; img.alt = ''; left.appendChild(img); body.appendChild(left);
    const rows = el('div', 'wx-rows'); const mk = (k, v) => { const r = el('div', 'wx-row'); r.append(el('span', 'wx-lab', k), el('span', 'wx-val', v)); rows.appendChild(r); };
    mk('FEELS LIKE', `${Math.round(c.apparent_temperature)}${tu}`); mk('HUMIDITY', `${c.relative_humidity_2m}%`); mk('WIND', `${dir(c.wind_direction_10m)} ${Math.round(c.wind_speed_10m)} ${su}`);
    body.appendChild(rows);
    fc.innerHTML = ''; const dd = data.daily; for (let i = 1; i <= 5 && i < dd.time.length; i++) { const day = el('div', 'wx-day'); const dt = new Date(dd.time[i] + 'T12:00:00');
      day.appendChild(el('div', 'wx-dn', DOW[dt.getDay()])); const ic = el('img'); ic.src = wmo(dd.weather_code[i], true).icon; ic.alt = ''; day.appendChild(ic);
      day.appendChild(el('div', 'wx-hl', `${Math.round(dd.temperature_2m_max[i])}° / ${Math.round(dd.temperature_2m_min[i])}°`)); if (dd.precipitation_probability_max?.[i] != null) day.appendChild(el('div', 'wx-pp', `${dd.precipitation_probability_max[i]}%`)); fc.appendChild(day); }
  };
  const refresh = async () => { try { data = await fetchOpenMeteo(loc, units); card.classList.remove('offline'); draw(); } catch (e) { console.warn('Open-Meteo:', e); card.classList.add('offline'); } };
  refresh(); setInterval(refresh, 10 * 60 * 1000);
  setInterval(() => { if (!data) return; face = 1 - face; body.hidden = !!face; fc.hidden = !face; ttl.textContent = face ? '5-DAY FORECAST' : 'CURRENT CONDITIONS'; }, 12000);
  return { refresh };
}
