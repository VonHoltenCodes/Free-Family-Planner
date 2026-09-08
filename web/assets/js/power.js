// Electricity pricing panel (ComEd Hourly Pricing via api/power.php): current ¢/kWh, the rest of
// today's day-ahead hours (and tomorrow's once posted ~4:30 PM CT), and SPIKE warnings above a
// threshold so the family can shift laundry, dishwasher, EV charging, etc.
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const hh = (h) => { const x = h % 24; return `${x % 12 || 12}${x < 12 ? 'a' : 'p'}`; };

export function mountPower(host, cfg, { onStatus, onAlert, publish } = {}) {
  const warn = Number(cfg.warnAbove ?? 8); const high = Number(cfg.highAbove ?? Math.max(4, warn * 0.6));
  host.innerHTML = '';
  const top = el('div', 'pw-top'); const big = el('div', 'pw-big', '—'); const word = el('div', 'pw-word', ''); const sub = el('div', 'pw-sub', '');
  const left = el('div', 'pw-left'); left.append(big, el('div', 'pw-unit', '¢ / kWh'), word); top.append(left);
  const banner = el('div', 'pw-banner'); banner.hidden = true;
  const strip = el('div', 'pw-strip'); host.append(top, banner, strip, sub);
  const level = (p) => (p == null ? '' : p >= warn ? 'spike' : p >= high ? 'high' : 'low');
  const refresh = async () => {
    try {
      const r = await fetch('api/power.php', { cache: 'no-store' }); const d = await r.json(); if (!r.ok || d.error && d.current == null) throw new Error(d.error || `power ${r.status}`);
      const cur = d.current ?? d.fiveMin; const lv = level(cur);
      big.textContent = cur == null ? '—' : cur.toFixed(1); word.textContent = { spike: 'SPIKE', high: 'HIGH', low: 'LOW' }[lv] || ''; host.className = `power ${lv}`;
      // upcoming hours: rest of today + tomorrow
      const upcoming = [...d.today.filter((x) => x.hour >= d.hour).map((x) => ({ ...x, day: 'today' })), ...d.tomorrow.map((x) => ({ ...x, day: 'tomorrow' }))].slice(0, 30);
      strip.innerHTML = ''; const max = Math.max(warn, ...upcoming.map((x) => x.price), 1);
      upcoming.forEach((x) => { const b = el('div', `pw-bar ${level(x.price)}${x.day === 'today' && x.hour === d.hour ? ' now' : ''}`); b.title = `${x.day} ${hh(x.hour)}: ${x.price}¢`;
        const fill = el('div', 'pw-fill'); fill.style.height = `${Math.max(6, Math.round((x.price / max) * 100))}%`; b.append(fill, el('span', 'pw-h', hh(x.hour))); strip.appendChild(b); });
      const spikes = upcoming.filter((x) => x.price >= warn && !(x.day === 'today' && x.hour === d.hour));
      const soon = spikes.filter((x) => x.day === 'today' && x.hour - d.hour <= 3);
      if (lv === 'spike' || spikes.length) {
        const runs = []; spikes.forEach((x) => { const last = runs[runs.length - 1]; if (last && last.day === x.day && last.end + 1 === x.hour) { last.end = x.hour; last.max = Math.max(last.max, x.price); } else runs.push({ day: x.day, start: x.hour, end: x.hour, max: x.price }); });
        banner.hidden = false; banner.textContent = (lv === 'spike' ? `PRICE SPIKE NOW (${cur.toFixed(1)}¢)` : 'SPIKE AHEAD') + (runs.length ? ' · ' + runs.map((r) => `${r.day === 'tomorrow' ? 'tmrw ' : ''}${hh(r.start)}–${hh(r.end + 1)} up to ${r.max.toFixed(1)}¢`).join(', ') : '');
      } else banner.hidden = true;
      sub.textContent = `${d.tomorrow.length ? 'tomorrow posted · ' : ''}5-min ${d.fiveMin != null ? d.fiveMin.toFixed(1) + '¢' : '—'} · avoid ≥ ${warn}¢`;
      onStatus?.('on'); onAlert?.(lv === 'spike' ? 'now' : soon.length ? 'soon' : null, cur);
      publish?.({ provider: 'comed', current: cur, fiveMin: d.fiveMin, level: lv, warnAbove: warn, upcoming: upcoming.slice(0, 12), spikes: spikes.map((x) => ({ day: x.day, hour: x.hour, price: x.price })) });
    } catch (e) { console.warn('power:', e.message); onStatus?.('warn'); host.classList.add('offline'); }
  };
  refresh(); const t = setInterval(refresh, 5 * 60 * 1000);
  return () => clearInterval(t);
}
