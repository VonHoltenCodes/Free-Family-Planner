// Per-display settings (stored in this browser): panel visibility + order, chores per kid,
// week start, clock format, units, orientation override, night-dim schedule.
// Also the layout engine that places the panels on the canvas grid for either orientation.
const LS = 'fp.display';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export const PANELS = {
  cal:    { id: 'p-cal',    name: 'Calendar',        width: 'full', h: '1fr' },
  wx:     { id: 'p-wx',     name: 'WeatherStar 4000+', width: 'half', h: '548px', side: 'left' },
  shop:   { id: 'p-shop',   name: 'Shopping list',   width: 'half', h: '300px', side: 'right' },
  week:   { id: 'p-week',   name: 'Week ahead',      width: 'full', h: '200px' },
  meals:  { id: 'p-meals',  name: 'Meal plan',       width: 'full', h: '176px' },
  chores: { id: 'p-chores', name: 'Chores',          width: 'half', h: '236px', side: 'left' },
  notes:  { id: 'p-notes',  name: 'Notes',           width: 'half', h: '236px', side: 'right' },
};
export const DEFAULT_DISPLAY = {
  order: ['cal', 'wx', 'shop', 'week', 'meals', 'chores', 'notes'],
  hidden: [],
  choresPerKid: 3,
  weekStart: 0,          // 0 = Sunday, 1 = Monday
  clock24: false,
  units: 'us',           // 'us' | 'metric'
  orientation: 'auto',   // 'auto' | 'portrait' | 'landscape'
  theme: 'hifi',         // 'hifi' | 'lcars' | 'paper' | 'contrast'
  dim: { enabled: false, from: '22:00', to: '06:00', level: 0.85 },
};

export function loadDisplay() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS) || 'null') || {}; } catch { /* ignore */ }
  const d = { ...structuredClone(DEFAULT_DISPLAY), ...saved, dim: { ...DEFAULT_DISPLAY.dim, ...(saved.dim || {}) } };
  // keep order complete even if new panels were added in an update
  d.order = [...d.order.filter((k) => PANELS[k]), ...Object.keys(PANELS).filter((k) => !d.order.includes(k))];
  d.hidden = d.hidden.filter((k) => PANELS[k]);
  return d;
}
export const saveDisplay = (d) => localStorage.setItem(LS, JSON.stringify(d));
export const THEMES = [['hifi', 'Hi-Fi'], ['lcars', 'LCARS'], ['paper', 'Paper'], ['contrast', 'High contrast']];
export function applyTheme(d) {
  const c = document.getElementById('canvas');
  THEMES.forEach(([k]) => c.classList.remove(`theme-${k}`));
  if (d.theme && d.theme !== 'hifi') c.classList.add(`theme-${d.theme}`);
}

/* ---------- layout engine ---------- */
const px = (h) => (h === '1fr' ? 0 : parseInt(h, 10));
export function applyLayout(d, portrait) {
  const main = document.querySelector('.main');
  const visible = d.order.filter((k) => !d.hidden.includes(k));
  Object.entries(PANELS).forEach(([k, p]) => { const e = document.getElementById(p.id); e.hidden = d.hidden.includes(k); e.style.gridArea = ''; e.style.gridColumn = ''; e.style.gridRow = ''; });
  document.querySelectorAll('.col, .row.bottom').forEach((c) => { c.style.display = ''; c.style.gridTemplateRows = ''; c.style.gridTemplateColumns = ''; c.hidden = false; });
  main.style.gridTemplateRows = ''; main.style.gridTemplateColumns = '';

  if (portrait) {
    // rows: full-width panels take a row; two consecutive half panels share one (left/right); a lone half spans both columns
    const rows = []; let i = 0;
    while (i < visible.length) {
      const a = visible[i]; const A = PANELS[a];
      if (A.width === 'full') { rows.push({ h: A.h, cells: [[a, '1/3']] }); i += 1; continue; }
      const b = visible[i + 1]; const B = b && PANELS[b];
      if (B && B.width === 'half') {
        const left = (A.side === 'right' && B.side === 'left') ? b : a; const right = left === a ? b : a;
        rows.push({ h: `${Math.max(px(A.h), px(B.h))}px`, cells: [[left, '1'], [right, '2']] }); i += 2;
      } else { rows.push({ h: a === 'wx' ? '800px' : A.h, cells: [[a, '1/3']] }); i += 1; }
    }
    if (!rows.some((r) => r.h === '1fr') && rows.length) rows[rows.length - 1].h = '1fr';
    main.style.gridTemplateColumns = '690px 1fr';
    main.style.gridTemplateRows = rows.map((r) => r.h).join(' ');
    rows.forEach((r, ri) => r.cells.forEach(([k, col]) => { const e = document.getElementById(PANELS[k].id); e.style.gridColumn = col; e.style.gridRow = String(ri + 1); }));
    return;
  }
  // landscape: fixed arrangement (left: cal/week, right: wx/shop, bottom: meals/chores/notes); hidden panels hand their space to neighbours
  const show = (k) => visible.includes(k);
  const left = document.querySelector('.col.left'); const right = document.querySelector('.col.right'); const bottom = document.querySelector('.row.bottom');
  left.style.gridTemplateRows = show('cal') && show('week') ? '1fr 206px' : '1fr';
  right.style.gridTemplateRows = show('wx') && show('shop') ? '528px 1fr' : '1fr';
  const leftOn = show('cal') || show('week'); const rightOn = show('wx') || show('shop');
  left.hidden = !leftOn; right.hidden = !rightOn;
  const bottomOn = show('meals') || show('chores') || show('notes'); bottom.hidden = !bottomOn;
  main.style.gridTemplateColumns = leftOn && rightOn ? '1176px 1fr' : '1fr';
  main.style.gridTemplateRows = (leftOn || rightOn) && bottomOn ? '1fr 206px' : '1fr';
  if (!(leftOn || rightOn)) bottom.style.gridTemplateRows = '';
  bottom.style.gridColumn = '1/-1';
  const cols = []; if (show('meals')) cols.push('1fr'); if (show('chores')) cols.push(show('meals') ? '560px' : '1fr'); if (show('notes')) cols.push(show('meals') ? '460px' : '1fr');
  bottom.style.gridTemplateColumns = cols.join(' ');
}

/* ---------- night dim ---------- */
export function startDim(d) {
  let overlay = document.getElementById('dim');
  if (!overlay) { overlay = el('div', 'dim'); overlay.id = 'dim'; overlay.hidden = true; document.getElementById('canvas').appendChild(overlay); }
  let wakeUntil = 0;
  const inWindow = () => { if (!d.dim.enabled) return false; const now = new Date(); const cur = now.getHours() * 60 + now.getMinutes();
    const [fh, fm] = d.dim.from.split(':').map(Number); const [th, tm] = d.dim.to.split(':').map(Number); const f = fh * 60 + fm; const t = th * 60 + tm;
    return f <= t ? (cur >= f && cur < t) : (cur >= f || cur < t); };
  const tick = () => { overlay.style.opacity = d.dim.level; overlay.hidden = !(inWindow() && Date.now() > wakeUntil); };
  const wake = () => { wakeUntil = Date.now() + 60_000; tick(); };
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, wake, { passive: true }));
  tick(); setInterval(tick, 15_000);
  return tick;
}

/* ---------- settings dialog ---------- */
export function openDisplaySettings(d, onChange) {
  if (document.getElementById('display-overlay')) return;
  const overlay = el('div', 'overlay'); overlay.id = 'display-overlay';
  const dlg = el('div', 'dlg setup display');
  const tbar = el('div', 'tbar'); tbar.appendChild(el('h3', null, 'Display settings')); tbar.appendChild(el('span', 'grow'));
  const x = el('button', 'x', '×'); x.type = 'button'; x.addEventListener('click', () => overlay.remove()); tbar.appendChild(x); dlg.appendChild(tbar);
  const body = el('div', 'form'); dlg.appendChild(body); overlay.appendChild(dlg); document.getElementById('canvas').appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  const commit = () => { saveDisplay(d); onChange(d); };

  body.appendChild(el('p', 'lead', 'These settings live on this display only (saved in this browser). Each screen in the house can be arranged differently.'));
  // panels
  body.appendChild(el('div', 'sect', 'Panels — show / hide and order (portrait follows the order; landscape keeps its fixed arrangement)'));
  const list = el('div', 'panel-list'); body.appendChild(list);
  const draw = () => { list.innerHTML = ''; d.order.forEach((k, i) => {
    const row = el('div', 'panel-row');
    const chk = el('button', 'chk' + (d.hidden.includes(k) ? '' : ' on')); chk.type = 'button'; chk.addEventListener('click', () => { d.hidden = d.hidden.includes(k) ? d.hidden.filter((h) => h !== k) : [...d.hidden, k]; draw(); commit(); });
    const up = el('button', 'btn sm', '▲'); up.type = 'button'; up.disabled = i === 0; up.addEventListener('click', () => { [d.order[i - 1], d.order[i]] = [d.order[i], d.order[i - 1]]; draw(); commit(); });
    const dn = el('button', 'btn sm', '▼'); dn.type = 'button'; dn.disabled = i === d.order.length - 1; dn.addEventListener('click', () => { [d.order[i + 1], d.order[i]] = [d.order[i], d.order[i + 1]]; draw(); commit(); });
    row.append(chk, el('span', 'pname', PANELS[k].name), el('span', 'grow'), up, dn); list.appendChild(row); }); };
  draw();
  const opt = (label, options, value, set) => { const wrap = el('div', 'opt'); wrap.appendChild(el('span', 'k', label)); const grp = el('div', 'seg');
    options.forEach(([v, name]) => { const b = el('button', 'btn sm' + (v === value ? ' on' : ''), name); b.type = 'button'; b.addEventListener('click', () => { set(v); grp.querySelectorAll('.btn').forEach((q) => q.classList.remove('on')); b.classList.add('on'); commit(); }); grp.appendChild(b); });
    wrap.appendChild(grp); return wrap; };
  body.appendChild(el('div', 'sect', 'Theme'));
  body.appendChild(opt('Theme', THEMES, d.theme, (v) => { d.theme = v; applyTheme(d); }));
  body.appendChild(el('div', 'sect', 'Behaviour'));
  body.appendChild(opt('Chores per kid', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], d.choresPerKid, (v) => { d.choresPerKid = v; }));
  body.appendChild(opt('Week starts on', [[0, 'Sunday'], [1, 'Monday']], d.weekStart, (v) => { d.weekStart = v; }));
  body.appendChild(opt('Clock', [[false, '12-hour'], [true, '24-hour']], d.clock24, (v) => { d.clock24 = v; }));
  body.appendChild(opt('Units', [['us', '°F / mph'], ['metric', '°C / km/h']], d.units, (v) => { d.units = v; }));
  body.appendChild(opt('Orientation', [['auto', 'Auto'], ['portrait', 'Portrait'], ['landscape', 'Landscape']], d.orientation, (v) => { d.orientation = v; }));
  body.appendChild(el('div', 'sect', 'Night dim — darken the screen on a schedule; any touch wakes it for a minute'));
  const dimRow = el('div', 'opt');
  const dchk = el('button', 'chk' + (d.dim.enabled ? ' on' : '')); dchk.type = 'button'; dchk.addEventListener('click', () => { d.dim.enabled = !d.dim.enabled; dchk.classList.toggle('on', d.dim.enabled); commit(); });
  const from = el('input'); from.type = 'time'; from.value = d.dim.from; from.addEventListener('change', () => { d.dim.from = from.value || '22:00'; commit(); });
  const to = el('input'); to.type = 'time'; to.value = d.dim.to; to.addEventListener('change', () => { d.dim.to = to.value || '06:00'; commit(); });
  dimRow.append(dchk, el('span', 'k', 'Dim from'), from, el('span', 'k', 'until'), to); body.appendChild(dimRow);
  body.appendChild(opt('Dim level', [[0.6, 'Soft'], [0.85, 'Dark'], [0.97, 'Off-ish']], d.dim.level, (v) => { d.dim.level = v; }));
  const actions = el('div', 'actions'); const reset = el('button', 'btn danger left', 'Reset to defaults'); reset.type = 'button';
  reset.addEventListener('click', () => { Object.assign(d, structuredClone(DEFAULT_DISPLAY)); commit(); overlay.remove(); openDisplaySettings(d, onChange); });
  const done = el('button', 'btn on', 'Done'); done.type = 'button'; done.addEventListener('click', () => overlay.remove());
  actions.append(reset, done); dlg.appendChild(actions);
}
