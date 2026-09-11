// Per-display settings (stored in this browser) and the layout engine.
// Two SCREENS share one display: "family" (planner) and "command" (home central command), with a
// mode of family / command / both (tabs, optional auto-rotate). Each screen has its own panel order,
// hidden set and which panels are shown full-width.
const LS = 'fp.display';
import { SAVERS } from './screensaver.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

export const PANELS = {
  cal:    { id: 'p-cal',    name: 'Calendar',          width: 'full', h: '1fr' },
  wx:     { id: 'p-wx',     name: 'WeatherStar 4000+', width: 'half', h: '548px', side: 'left' },
  shop:   { id: 'p-shop',   name: 'Shopping list',     width: 'half', h: '300px', side: 'right' },
  week:   { id: 'p-week',   name: 'Week ahead',        width: 'full', h: '200px' },
  meals:  { id: 'p-meals',  name: 'Meal plan',         width: 'full', h: '176px' },
  chores: { id: 'p-chores', name: 'Chores',            width: 'half', h: '236px', side: 'left' },
  notes:  { id: 'p-notes',  name: 'Notes',             width: 'half', h: '236px', side: 'right' },
  house:  { id: 'p-house',  name: 'House (home hub)',  width: 'half', h: '236px', side: 'left', wideH: '1fr' },
  power:  { id: 'p-power',  name: 'Electricity (ComEd)', width: 'half', h: '236px', side: 'right', wideH: '360px' },
};
export const SCREENS = { family: 'Family', command: 'Command' };
const unavailable = new Set(['house', 'power']);
export function setPanelAvailable(key, ok) { if (ok) unavailable.delete(key); else unavailable.add(key); }

const DEFAULT_SCREENS = {
  // Family = the planner exactly as it was; house + electricity live on the Command tab
  family:  { v: 2, order: ['cal', 'wx', 'shop', 'week', 'meals', 'chores', 'notes', 'power', 'house'], hidden: ['power', 'house'], wide: [] },
  // Command = the house: controls first; weather, lists, meals, chores and notes live on the Family tab
  // Command = the house only: controls + electricity. Add anything else per screen in ☰ Display.
  command: { v: 4, order: ['house', 'power', 'cal', 'week', 'wx', 'notes', 'shop', 'meals', 'chores'], hidden: ['cal', 'week', 'wx', 'notes', 'shop', 'meals', 'chores'], wide: ['house', 'power'] },
};
export const DEFAULT_DISPLAY = {
  mode: null,            // 'family' | 'command' | 'both' — null = follow config.defaultMode
  active: 'family',
  rotateMinutes: 0,      // in 'both' mode: auto-switch tabs every N minutes (0 = off)
  screens: structuredClone(DEFAULT_SCREENS),
  choresPerKid: 3, weekStart: 0, clock24: false, units: 'us', orientation: 'auto', theme: 'hifi',
  dim: { enabled: false, from: '22:00', to: '06:00', level: 0.85 },
  saver: 'drift', saverMinutes: 20, pixelShift: true,   // burn-in care for an always-on display
  nightlyReload: 4,                                      // quiet-hour reload (hour, -1 = off)
  hubSync: false,
};

export function loadDisplay() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS) || 'null') || {}; } catch { /* ignore */ }
  const d = { ...structuredClone(DEFAULT_DISPLAY), ...saved, dim: { ...DEFAULT_DISPLAY.dim, ...(saved.dim || {}) }, screens: structuredClone(DEFAULT_SCREENS) };
  // migrate v1 (single order/hidden) into the family screen
  if (saved.order && !saved.screens) { d.screens.family.order = saved.order; d.screens.family.hidden = saved.hidden || []; }
  if (saved.screens) Object.keys(DEFAULT_SCREENS).forEach((k) => { if (saved.screens[k] && (saved.screens[k].v || 0) >= (DEFAULT_SCREENS[k].v || 0)) d.screens[k] = { ...DEFAULT_SCREENS[k], ...saved.screens[k] }; });
  Object.values(d.screens).forEach((s) => { s.order = [...s.order.filter((k) => PANELS[k]), ...Object.keys(PANELS).filter((k) => !s.order.includes(k))]; s.hidden = s.hidden.filter((k) => PANELS[k]); s.wide = (s.wide || []).filter((k) => PANELS[k]); });
  delete d.order; delete d.hidden;
  if (!SCREENS[d.active]) d.active = 'family';
  if (!saved.active) d.active = null;   // resolved from config.defaultTab at boot
  return d;
}
export const saveDisplay = (d) => localStorage.setItem(LS, JSON.stringify(d));
export const effectiveMode = () => 'both';   // tabs are always shown; the default tab comes from config.defaultTab
export function currentScreen(d) { return SCREENS[d.active] ? d.active : 'family'; }
export function defaultTab(config) { const t = config?.defaultTab || config?.defaultMode; return SCREENS[t] ? t : 'family'; }

/* ---------- layout engine ---------- */
const px = (h) => (h === '1fr' ? 0 : parseInt(h, 10));
/* Rows are ideal pixel heights; if they do not fit the canvas, hand out the space proportionally instead. */
function fitRows(rows, avail) {
  const fixed = rows.reduce((n, r) => n + px(r.h), 0); const flex = rows.filter((r) => r.h === '1fr').length;
  if (fixed + flex * 300 <= avail) return rows.map((r) => r.h).join(' ');
  const big = Math.max(400, ...rows.map((r) => px(r.h)));
  return rows.map((r) => `minmax(0, ${(r.h === '1fr' ? big : px(r.h)) / 50}fr)`).join(' ');
}
export function applyLayout(d, portrait, screenKey = 'family') {
  const sc = d.screens[screenKey] || d.screens.family;
  const main = document.querySelector('.main');
  const visible = sc.order.filter((k) => !sc.hidden.includes(k) && !unavailable.has(k));
  const wide = new Set(sc.wide || []);
  Object.entries(PANELS).forEach(([k, p]) => { const e = document.getElementById(p.id); e.hidden = !visible.includes(k); e.classList.toggle('wide', wide.has(k)); e.style.gridArea = ''; e.style.gridColumn = ''; e.style.gridRow = ''; });
  document.querySelectorAll('.col, .row.bottom').forEach((c) => { c.style.display = ''; c.style.gridTemplateRows = ''; c.style.gridTemplateColumns = ''; c.hidden = false; });
  main.style.gridTemplateRows = ''; main.style.gridTemplateColumns = '';
  const widthOf = (k) => (wide.has(k) ? 'full' : (!portrait && (k === 'week' || k === 'meals') ? 'half' : PANELS[k].width));
  const heightOf = (k) => (wide.has(k) && PANELS[k].wideH ? PANELS[k].wideH : PANELS[k].h);

  if (portrait) {
    const rows = []; let i = 0;
    while (i < visible.length) {
      const a = visible[i];
      if (widthOf(a) === 'full') { rows.push({ h: heightOf(a), cells: [[a, '1/3']] }); i += 1; continue; }
      const b = visible[i + 1];
      if (b && widthOf(b) === 'half') {
        const left = (PANELS[a].side === 'right' && PANELS[b].side === 'left') ? b : a; const right = left === a ? b : a;
        rows.push({ h: `${Math.max(px(heightOf(a)), px(heightOf(b)))}px`, cells: [[left, '1'], [right, '2']] }); i += 2;
      } else { rows.push({ h: a === 'wx' ? '800px' : heightOf(a), cells: [[a, '1/3']] }); i += 1; }
    }
    if (!rows.some((r) => r.h === '1fr') && rows.length) rows[rows.length - 1].h = '1fr';
    main.style.gridTemplateColumns = '690px 1fr';
    main.style.gridTemplateRows = fitRows(rows, 1920 - 60 - 26 - 20 - 16 - (rows.length - 1) * 8);
    rows.forEach((r, ri) => r.cells.forEach(([k, col]) => { const e = document.getElementById(PANELS[k].id); e.style.gridColumn = col; e.style.gridRow = String(ri + 1); }));
    return;
  }
  // landscape: order-driven too — full panels take a row across, halves pair up; each row's height from its panels
  const cols = document.querySelectorAll('.col, .row.bottom'); cols.forEach((c) => { c.style.display = 'contents'; });
  const rows = []; let i = 0;
  while (i < visible.length) {
    const a = visible[i];
    if (widthOf(a) === 'full') { rows.push({ h: heightOf(a) === '1fr' ? '1fr' : heightOf(a), cells: [[a, '1/4']] }); i += 1; continue; }
    const b = visible[i + 1]; const c = visible[i + 2];
    const halves = [a]; if (b && widthOf(b) === 'half') halves.push(b); if (halves.length === 2 && c && widthOf(c) === 'half' && !['wx', 'house'].includes(a)) halves.push(c);
    const h = Math.max(...halves.map((k) => (heightOf(k) === '1fr' ? 528 : px(heightOf(k)))));
    const span = halves.length === 3 ? ['1', '2', '3'] : halves.length === 2 ? ['1/3', '3/4'] : ['1/4'];
    rows.push({ h: `${Math.min(h, 560)}px`, cells: halves.map((k, j) => [k, span[j]]) }); i += halves.length;
  }
  if (!rows.some((r) => r.h === '1fr') && rows.length) rows[0].h = '1fr';
  main.style.gridTemplateColumns = 'repeat(3, 1fr)';
  main.style.gridTemplateRows = fitRows(rows, 1080 - 60 - 26 - 20 - 16 - (rows.length - 1) * 8);
  rows.forEach((r, ri) => r.cells.forEach(([k, col]) => { const e = document.getElementById(PANELS[k].id); e.style.gridColumn = col; e.style.gridRow = String(ri + 1); }));
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

/* ---------- themes ---------- */
export const THEMES = [['hifi', 'Hi-Fi'], ['lcars', 'LCARS'], ['paper', 'Paper'], ['eink', 'E-ink'], ['contrast', 'High contrast']];
export function applyTheme(d) {
  const c = document.getElementById('canvas');
  THEMES.forEach(([k]) => c.classList.remove(`theme-${k}`));
  if (d.theme && d.theme !== 'hifi') c.classList.add(`theme-${d.theme}`);
}

/* ---------- settings dialog ---------- */
export function openDisplaySettings(d, config, onChange, { openTiles } = {}) {
  // SAVERS comes from screensaver.js; imported at the top
  if (document.getElementById('display-overlay')) return;
  const overlay = el('div', 'overlay'); overlay.id = 'display-overlay';
  const dlg = el('div', 'dlg setup display');
  const tbar = el('div', 'tbar'); tbar.appendChild(el('h3', null, 'Display settings')); tbar.appendChild(el('span', 'grow'));
  const x = el('button', 'x', '×'); x.type = 'button'; x.addEventListener('click', () => overlay.remove()); tbar.appendChild(x); dlg.appendChild(tbar);
  const body = el('div', 'form'); dlg.appendChild(body); overlay.appendChild(dlg); document.getElementById('canvas').appendChild(overlay);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  const commit = () => { saveDisplay(d); onChange(d); };
  const opt = (label, options, value, set) => { const wrap = el('div', 'opt'); wrap.appendChild(el('span', 'k', label)); const grp = el('div', 'seg');
    options.forEach(([v, name]) => { const b = el('button', 'btn sm' + (v === value ? ' on' : ''), name); b.type = 'button'; b.addEventListener('click', () => { set(v); grp.querySelectorAll('.btn').forEach((q) => q.classList.remove('on')); b.classList.add('on'); commit(); }); grp.appendChild(b); });
    wrap.appendChild(grp); return wrap; };

  body.appendChild(el('p', 'lead', 'These settings live on this display only (saved in this browser). Each screen in the house can be arranged differently.'));
  body.appendChild(el('div', 'sect', 'Screens — FAMILY / COMMAND tabs are in the status bar; pick the default tab in ⚙ Setup'));
  body.appendChild(opt('Auto-switch tabs', [[0, 'Off'], [5, '5 min'], [10, '10 min'], [30, '30 min']], d.rotateMinutes, (v) => { d.rotateMinutes = v; }));
  body.appendChild(el('small', 'hint', 'Auto-switch never fires within two minutes of a touch, while typing, or while a dialog is open.'));
  // per-screen panel editor
  let editing = currentScreen(d);
  body.appendChild(el('div', 'sect', 'Panels — show / hide, order, and width, per screen (devices and tiles are picked in ⚙ Setup → Home hub)'));
  const pick = el('div', 'seg'); const list = el('div', 'panel-list');
  const drawPick = () => { pick.innerHTML = ''; Object.entries(SCREENS).forEach(([k, name]) => { const b = el('button', 'btn sm' + (k === editing ? ' on' : ''), `${name} screen`); b.type = 'button'; b.addEventListener('click', () => { editing = k; drawPick(); draw(); }); pick.appendChild(b); }); };
  const draw = () => { const sc = d.screens[editing]; list.innerHTML = ''; sc.order.forEach((k, i) => {
    const row = el('div', 'panel-row');
    const chk = el('button', 'chk' + (sc.hidden.includes(k) ? '' : ' on')); chk.type = 'button'; chk.setAttribute('role', 'switch'); chk.setAttribute('aria-checked', String(!sc.hidden.includes(k))); chk.setAttribute('aria-label', `Show ${PANELS[k].name}`);
    chk.addEventListener('click', () => { sc.hidden = sc.hidden.includes(k) ? sc.hidden.filter((h) => h !== k) : [...sc.hidden, k]; draw(); commit(); });
    const wideB = el('button', 'btn sm' + (sc.wide.includes(k) ? ' on' : ''), 'Wide'); wideB.type = 'button'; wideB.title = 'Full width'; wideB.disabled = PANELS[k].width === 'full';
    wideB.addEventListener('click', () => { sc.wide = sc.wide.includes(k) ? sc.wide.filter((w) => w !== k) : [...sc.wide, k]; draw(); commit(); });
    const up = el('button', 'btn sm', '▲'); up.type = 'button'; up.disabled = i === 0; up.addEventListener('click', () => { [sc.order[i - 1], sc.order[i]] = [sc.order[i], sc.order[i - 1]]; draw(); commit(); });
    const dn = el('button', 'btn sm', '▼'); dn.type = 'button'; dn.disabled = i === sc.order.length - 1; dn.addEventListener('click', () => { [sc.order[i + 1], sc.order[i]] = [sc.order[i], sc.order[i + 1]]; draw(); commit(); });
    if (k === 'house' && openTiles) { const tb = el('button', 'btn sm', 'Tiles…'); tb.type = 'button'; tb.title = 'Choose which devices show as tiles (⚙ Setup → Home hub)'; tb.addEventListener('click', () => { overlay.remove(); openTiles(); }); row.append(chk, el('span', 'pname', PANELS[k].name), tb, el('span', 'grow'), wideB, up, dn); }
    else row.append(chk, el('span', 'pname', PANELS[k].name), el('span', 'grow'), wideB, up, dn); list.appendChild(row); }); };
  drawPick(); draw(); body.append(pick, list);
  body.appendChild(el('div', 'sect', 'Theme'));
  body.appendChild(opt('Theme', THEMES, d.theme, (v) => { d.theme = v; applyTheme(d); }));
  body.appendChild(el('div', 'sect', 'Behaviour'));
  body.appendChild(opt('Chores per kid', [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], d.choresPerKid, (v) => { d.choresPerKid = v; }));
  body.appendChild(opt('Week starts on', [[0, 'Sunday'], [1, 'Monday']], d.weekStart, (v) => { d.weekStart = v; }));
  body.appendChild(opt('Clock', [[false, '12-hour'], [true, '24-hour']], d.clock24, (v) => { d.clock24 = v; }));
  body.appendChild(opt('Units', [['us', '°F / mph'], ['metric', '°C / km/h']], d.units, (v) => { d.units = v; }));
  body.appendChild(opt('Orientation', [['auto', 'Auto'], ['portrait', 'Portrait'], ['landscape', 'Landscape']], d.orientation, (v) => { d.orientation = v; }));
  body.appendChild(opt('Hub shopping sync', [[false, 'Off'], [true, 'This screen syncs']], d.hubSync, (v) => { d.hubSync = v; }));
  body.appendChild(el('small', 'hint', 'Turn on for exactly one screen (the wall display) so the shopping list and the hub\'s to-do list stay in step.'));
  body.appendChild(el('div', 'sect', 'Screen care — this display is on 24/7'));
  body.appendChild(opt('Screensaver', SAVERS, d.saver, (v) => { d.saver = v; }));
  body.appendChild(opt('Starts after', [[5, '5 min'], [10, '10 min'], [20, '20 min'], [45, '45 min'], [120, '2 h']], d.saverMinutes, (v) => { d.saverMinutes = v; }));
  body.appendChild(opt('Pixel shift', [[true, 'On'], [false, 'Off']], d.pixelShift, (v) => { d.pixelShift = v; }));
  body.appendChild(el('small', 'hint', 'The screensaver drifts a clock around a dark screen when nobody has touched the display; any touch brings the planner back. Pixel shift nudges the whole layout a couple of pixels every few minutes so panel edges do not burn in.'));
  body.appendChild(opt('Nightly refresh', [[-1, 'Off'], [3, '3 AM'], [4, '4 AM'], [5, '5 AM']], d.nightlyReload, (v) => { d.nightlyReload = v; }));
  body.appendChild(el('small', 'hint', 'Reloads the page once in the small hours. Long-running browsers get slow and occasionally wedge; this clears it before anyone is up.'));
  body.appendChild(el('div', 'sect', 'Night dim — darken the screen on a schedule; any touch wakes it for a minute'));
  const dimRow = el('div', 'opt');
  const dchk = el('button', 'chk' + (d.dim.enabled ? ' on' : '')); dchk.type = 'button'; dchk.addEventListener('click', () => { d.dim.enabled = !d.dim.enabled; dchk.classList.toggle('on', d.dim.enabled); commit(); });
  const from = el('input'); from.type = 'time'; from.value = d.dim.from; from.addEventListener('change', () => { d.dim.from = from.value || '22:00'; commit(); });
  const to = el('input'); to.type = 'time'; to.value = d.dim.to; to.addEventListener('change', () => { d.dim.to = to.value || '06:00'; commit(); });
  dimRow.append(dchk, el('span', 'k', 'Dim from'), from, el('span', 'k', 'until'), to); body.appendChild(dimRow);
  body.appendChild(opt('Dim level', [[0.6, 'Soft'], [0.85, 'Dark'], [0.97, 'Off-ish']], d.dim.level, (v) => { d.dim.level = v; }));
  const actions = el('div', 'actions'); const reset = el('button', 'btn danger left', 'Reset to defaults'); reset.type = 'button';
  reset.addEventListener('click', () => { Object.assign(d, structuredClone(DEFAULT_DISPLAY)); commit(); overlay.remove(); openDisplaySettings(d, config, onChange); });
  const done = el('button', 'btn on', 'Done'); done.type = 'button'; done.addEventListener('click', () => overlay.remove());
  actions.append(reset, done); dlg.appendChild(actions);
}
