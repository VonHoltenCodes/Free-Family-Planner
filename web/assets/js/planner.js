// Family Central Command — vanilla canvas build (no framework).
import * as store from './store.js';
import { Calendars } from './calendars.js';
import { currentConditions, resolveProvider, weatherStarUrl } from './wx.js';
import { mountCard, openMeteoConditions } from './wx-card.js';
import { loadConfig, isConfigured } from './config-loader.js';
import { openSetup } from './setup.js';
import { stateSet } from './state-publisher.js';
import { hub, mountHouse, startTodoSync } from './hub.js';
import { mountPower } from './power.js';
import { startWatchdog, beat, health, noteError } from './watchdog.js';
import { startPixelShift, startScreensaver } from './screensaver.js';
import { loadDisplay, applyLayout, applyTheme, startDim, openDisplaySettings, setPanelAvailable, currentScreen, defaultTab, SCREENS, PANELS } from './display.js';

const config = await loadConfig();
const display = loadDisplay();
if (!display.active) display.active = defaultTab(config);
applyTheme(display);
store.initStore(config);

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseLocal = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const KIDS = config.family.kids || [];
const CHORES_PER_KID = display.choresPerKid;

/* ---------- branding from config ---------- */
document.title = `${config.family.title} — ${config.family.subtitle}`;
$('hdr-title').firstChild.textContent = config.family.title;
$('hdr-subtitle').textContent = config.family.subtitle;
$('wx-place').textContent = config.location.label || '';
stateSet('family', { title: config.family.title, subtitle: config.family.subtitle, location: config.location.label || '' });
$('btn-setup').addEventListener('click', () => openSetup(config));
$('btn-display').addEventListener('click', () => openDisplaySettings(display, config, () => {
  stopShift(); stopShift = startPixelShift(display.pixelShift); saver.wake(); if (display.choresPerKid !== CHORES_PER_KID) { location.reload(); return; } lastPortrait = null; fitCanvas(); tickClock(); if (config.location.lat != null) refreshWx(); if (typeof renderAll === 'function') renderAll(); dimTick(); }, { openTiles: () => openSetup(config, { step: 6 }) }));
const dimTick = startDim(display);
let stopShift = startPixelShift(display.pixelShift);
const saver = startScreensaver(display, () => {
  const next = expanded.map((r) => r).sort((a, b) => (a.key || '').localeCompare(b.key || '')).find((r) => r.key >= todayKey);
  const p = config.power?.provider === 'comed' ? (document.querySelector('#power .pw-big')?.textContent || '') : '';
  return { line: next ? `${next.key === todayKey ? 'Today' : new Date(next.key + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' })} — ${next.ev.summary || ''}` : '',
           sub: [$('hdr-temp').textContent !== '--' ? `${$('hdr-temp').textContent}°${display.units === 'metric' ? 'C' : 'F'} ${$('hdr-cond').textContent}` : '', p ? `${p}¢/kWh` : ''].filter(Boolean).join('  ·  ') };
});
startWatchdog({ frame: $('wx-frame'), nightlyHour: display.nightlyReload, recycleHours: 6, onStatus: (s, why) => { if (why) console.warn('watchdog:', why); } });
setInterval(() => stateSet('health', health()), 60_000);
if (!isConfigured(config)) setTimeout(() => openSetup(config, { firstRun: true }), 600);
{ const f = $('status-footer'); f.innerHTML = ''; (config.family.footer || []).forEach((t, i) => { if (i) f.appendChild(el('span', 'sep', '•')); f.appendChild(el('span', null, t)); }); }

/* ---------- canvas scaler: design canvas fitted to any display ---------- */
let lastPortrait = null;
let baseViewport = { w: window.innerWidth, h: window.innerHeight, scale: 1 };
const isField = (e) => e && (e.tagName === 'INPUT' || e.tagName === 'TEXTAREA' || e.tagName === 'SELECT');
/* On-screen keyboard: the viewport shrinks while a field is focused. Instead of re-scaling the whole
   canvas (which makes it jump), keep the scale and slide the canvas so the focused field stays visible. */
function keyboardGuard() {
  const vv = window.visualViewport; const h = vv ? vv.height : window.innerHeight; const w = vv ? vv.width : window.innerWidth;
  const field = document.activeElement; const c = $('canvas');
  if (!isField(field) || h >= baseViewport.h * 0.9 || w !== baseViewport.w) { c.classList.remove('kbd'); return false; }
  const r = field.getBoundingClientRect(); const visibleBottom = h - 16;
  const shift = r.bottom > visibleBottom ? visibleBottom - r.bottom - 8 : 0;
  const [ox, oy] = (c.dataset.offset || '0,0').split(',').map(Number);
  c.classList.add('kbd'); c.style.transform = `translate(${ox}px, ${oy + shift}px) scale(${baseViewport.scale})`;
  return true;
}
function viewport() {
  const vv = window.visualViewport;
  return vv && vv.width > 0 ? { w: vv.width, h: vv.height, x: vv.offsetLeft, y: vv.offsetTop, zoom: vv.scale } : { w: window.innerWidth, h: window.innerHeight, x: 0, y: 0, zoom: 1 };
}
function fitCanvas() {
  if (keyboardGuard()) return;
  const v = viewport();
  const portrait = display.orientation === 'auto' ? v.h > v.w : display.orientation === 'portrait';
  const c = $('canvas'); c.classList.toggle('portrait', portrait);
  if (portrait !== lastPortrait) { lastPortrait = portrait; applyLayout(display, portrait, currentScreen(display)); renderTabs(); }
  const [w, h] = portrait ? [1080, 1920] : [1920, 1080];
  const s = Math.min(v.w / w, v.h / h);
  const ox = Math.round((v.w - w * s) / 2); const oy = Math.round((v.h - h * s) / 2);
  c.style.transform = `translate(${ox}px, ${oy}px) scale(${s})`;
  c.dataset.offset = `${ox},${oy}`;
  // size and place the scaler to the *visible* viewport (handles pinch-zoom, URL bars, side nav bars)
  const sc = document.querySelector('.scaler'); sc.style.left = `${v.x}px`; sc.style.top = `${v.y}px`; sc.style.width = `${v.w}px`; sc.style.height = `${v.h}px`;
  baseViewport = { w: v.w, h: v.h, scale: s };
  const c2 = c.getBoundingClientRect();
  stateSet('display', { vv: [Math.round(v.w), Math.round(v.h), Math.round(v.x), Math.round(v.y)], zoom: +v.zoom.toFixed(2), inner: [window.innerWidth, window.innerHeight], screen: [screen.width, screen.height], dpr: devicePixelRatio, scale: +s.toFixed(3), portrait, canvasBox: [Math.round(c2.left), Math.round(c2.top), Math.round(c2.width), Math.round(c2.height)], fullscreen: !!document.fullscreenElement, ua: navigator.userAgent.slice(0, 120) });
  if (location.search.includes('debug')) debugReadout(v, s, portrait);
}
function debugReadout(v, s, portrait) {
  let d = $('debug'); if (!d) { d = el('div', 'debug'); d.id = 'debug'; document.body.appendChild(d); }
  d.textContent = `vv ${Math.round(v.w)}×${Math.round(v.h)} @${v.x},${v.y} zoom ${v.zoom.toFixed(2)} | inner ${window.innerWidth}×${window.innerHeight} | screen ${screen.width}×${screen.height} dpr ${devicePixelRatio} | scale ${s.toFixed(3)} ${portrait ? 'portrait' : 'landscape'} | ${navigator.userAgent.slice(0, 90)}`;
}
window.addEventListener('resize', fitCanvas);
window.visualViewport?.addEventListener('resize', fitCanvas);
['orientationchange', 'fullscreenchange', 'pageshow', 'load'].forEach((ev) => window.addEventListener(ev, () => setTimeout(fitCanvas, 150)));
[300, 1000, 3000].forEach((ms) => setTimeout(fitCanvas, ms));   // Android browsers settle the viewport (URL bar, nav bar) after load
setInterval(() => { const v = viewport(); if (!isField(document.activeElement) && (Math.abs(v.w - baseViewport.w) > 1 || Math.abs(v.h - baseViewport.h) > 1)) fitCanvas(); }, 5000);
window.visualViewport?.addEventListener('scroll', fitCanvas);
document.addEventListener('focusin', (e) => { if (isField(e.target)) setTimeout(fitCanvas, 250); });
document.addEventListener('focusout', () => setTimeout(fitCanvas, 100));
fitCanvas();

/* ---------- screens: Family / Command tabs ---------- */
function renderTabs() {
  const nav = $('tabs'); nav.hidden = false; nav.innerHTML = '';
  Object.entries(SCREENS).forEach(([k, name]) => { const b = el('button', 'tab' + (display.active === k ? ' on' : ''), name.toUpperCase()); b.type = 'button'; b.setAttribute('aria-pressed', String(display.active === k)); b.addEventListener('click', () => switchScreen(k)); nav.appendChild(b); });
}
function switchScreen(k) { if (display.active === k) return; display.active = k; lastSwitch = Date.now(); localStorage.setItem('fp.display', JSON.stringify(display)); lastPortrait = null; fitCanvas(); }
let lastTouch = Date.now(); let lastSwitch = Date.now();
setInterval(() => { const idle = Date.now() - lastTouch > 120_000; const typing = isField(document.activeElement); const dialog = !!document.querySelector('.overlay:not([hidden])');
  if (display.rotateMinutes > 0 && idle && !typing && !dialog && Date.now() - lastSwitch >= display.rotateMinutes * 60_000) { lastSwitch = Date.now(); switchScreen(display.active === 'family' ? 'command' : 'family'); } }, 15_000);
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { lastTouch = Date.now(); }, { passive: true }));

/* ---------- toast + LEDs ---------- */
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
function led(id, state) { const e = $(id); e.className = 'led' + (state ? ` ${state}` : ''); }

/* ---------- clock / date / midnight rollover ---------- */
let todayKey = dateKey(new Date());
const onNewDay = [];
function tickClock() {
  const now = new Date();
  let h = now.getHours(); const ampm = h >= 12 ? 'PM' : 'AM'; if (!display.clock24) h = h % 12 || 12;
  $('hdr-clock').textContent = `${pad(h)}:${pad(now.getMinutes())}`;
  $('hdr-ampm').textContent = display.clock24 ? '' : ampm;
  $('hdr-date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  const k = dateKey(now);
  if (k !== todayKey) { todayKey = k; onNewDay.forEach((f) => f()); }
}
setInterval(() => { tickClock(); beat('clock', 1000); }, 1000);
tickClock();

/* ---------- fullscreen ---------- */
$('btn-full').addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.();
});

/* ---------- weather: WeatherStar 4000+ (NWS coverage) or the Open-Meteo card; header temp ---------- */
let wxProvider = 'none';
async function refreshWx() {
  try {
    const w = wxProvider === 'card' ? await openMeteoConditions(config.location, display.units) : await currentConditions(config.location);
    $('hdr-temp').textContent = wxProvider === 'card' ? w.temp : (display.units === 'metric' ? Math.round((w.tempF - 32) * 5 / 9) : w.tempF);
    document.querySelector('.lcd.temp .unit').textContent = display.units === 'metric' ? '°C' : '°F';
    $('hdr-cond').textContent = w.cond;
    led('led-wx', 'on'); beat('weather', 10 * 60_000); stateSet('weather', { temp: Number($('hdr-temp').textContent), cond: w.cond, units: display.units, provider: wxProvider });
  } catch (e) { console.warn('weather:', e); led('led-wx', 'warn'); }
}
(async () => {
  if (config.location.lat == null) { led('led-wx', 'warn'); $('wx-frame').removeAttribute('src'); return; }
  wxProvider = await resolveProvider(config.weather, config.location);
  const bezel = document.querySelector('#p-wx .bezel');
  if (wxProvider === 'card') { mountCard(bezel, config.location, config.location.label, display.units); $('led-wx-label').textContent = 'OPEN-METEO'; document.querySelector('#p-wx .tbar h2').textContent = 'Weather'; }
  else { $('wx-frame').src = weatherStarUrl(config.location, config.weather, display.units); }
  refreshWx(); setInterval(refreshWx, 10 * 60 * 1000);
})();

/* ---------- electricity pricing (ComEd hourly) ---------- */
if (config.power?.provider === 'comed') {
  setPanelAvailable('power', true); lastPortrait = null; fitCanvas();
  const alert = $('hdr-alert');
  mountPower($('power'), config.power, {
    onStatus: (s) => { $('power-sub').textContent = s === 'on' ? 'ComEd hourly' : 'ComEd — no data'; },
    onAlert: (kind, price) => { alert.hidden = !kind; alert.className = `hdr-alert${kind === 'soon' ? ' soon' : ''}`; alert.textContent = kind === 'now' ? `⚡ PRICE SPIKE ${price.toFixed(1)}¢` : kind === 'soon' ? '⚡ SPIKE SOON' : ''; },
    publish: (p) => stateSet('power', p),
  });
}

/* ---------- home hub: House panel + shopping-list sync ---------- */
(async () => {
  let st = null;
  try { st = await hub.status(); } catch (e) { return; }   // static host / no endpoint: feature off
  if (!st || st.type === 'none') return;
  $('svc-hub').hidden = false; $('led-hub-label').textContent = st.type === 'homeio' ? 'HOME-IO' : 'HOME ASSISTANT';
  const tiles = config.house?.tiles || [];
  setPanelAvailable('house', tiles.length > 0); lastPortrait = null; fitCanvas();
  $('house-sub').textContent = st.type === 'homeio' ? 'Home-IO' : 'Home Assistant';
  if (tiles.length) mountHouse($('house-tiles'), tiles, (s) => led('led-hub', s), { toast });
  if (display.hubSync && st.type === 'homeassistant') startTodoSync(() => listCache.shopping, (s) => led('led-hub', s));
})();

/* ---------- check lists: shopping + notes ---------- */
const listCache = { shopping: [], notes: [] };
function bindList(name, formId, inputId, listId, countId) {
  const list = $(listId); const input = $(inputId);
  $(formId).addEventListener('submit', async (e) => {
    e.preventDefault(); const text = input.value.trim(); if (!text) return;
    input.value = '';
    try { await store.addListItem(name, text); } catch (err) { toast('Save failed'); console.error(err); }
  });
  store.watchList(name, (items) => {
    led('led-fb', 'on'); beat(`list:${name}`, 60_000); stateSet(name, items); listCache[name] = items;
    list.innerHTML = '';
    if (!items.length) { list.appendChild(el('li', 'empty', 'Nothing here.')); }
    items.forEach((it) => {
      const li = el('li', it.completed ? 'done' : '');
      const chk = el('button', 'chk' + (it.completed ? ' on' : '')); chk.type = 'button'; chk.title = 'Done'; chk.setAttribute('role', 'switch'); chk.setAttribute('aria-checked', String(!!it.completed)); chk.setAttribute('aria-label', `Done: ${it.text}`);
      chk.addEventListener('click', () => store.toggleListItem(name, it.id, !!it.completed));
      const txt = el('span', 'txt', it.text);
      const del = el('button', 'del', '×'); del.type = 'button'; del.title = 'Remove'; del.setAttribute('aria-label', `Remove ${it.text}`);
      del.addEventListener('click', () => store.deleteListItem(name, it.id));
      li.append(chk, txt, del); list.appendChild(li);
    });
    if (countId) { const open = items.filter((i) => !i.completed).length; $(countId).textContent = items.length ? `${open} open / ${items.length}` : ''; }
  }, () => led('led-fb', store.configured ? 'err' : 'warn'));
}
if (!store.configured) led('led-fb', 'warn');
$('led-fb-label').textContent = { firestore: 'FIRESTORE', sync: 'SYNC STORE', local: 'LOCAL DATA' }[store.backendName] || 'NO DATA';
bindList('shopping', 'shop-form', 'shop-input', 'shop-list', 'shop-count');
bindList('notes', 'note-form', 'note-input', 'note-list', null);

/* ---------- meals ---------- */
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
let meals = {};
const mealBoxes = {};
{
  const wrap = $('meals');
  FULL.forEach((day, i) => {
    const card = el('div', 'meal'); card.dataset.day = day;
    const head = el('div', 'mh'); head.appendChild(el('span', 'dn', DOW[i].toUpperCase()));
    const clr = el('button', 'clr', '×'); clr.type = 'button'; clr.title = 'Clear'; clr.setAttribute('aria-label', `Clear ${day} meal`);
    clr.addEventListener('click', () => { meals = { ...meals, [day]: '' }; mealBoxes[day].value = ''; store.saveMeals(meals).catch(() => toast('Save failed')); });
    head.appendChild(clr);
    const ta = el('textarea'); ta.placeholder = '…'; ta.rows = 3; ta.setAttribute('aria-label', `${day} meal`);
    const save = debounce(() => store.saveMeals(meals).catch(() => toast('Save failed')), 500);
    ta.addEventListener('input', () => { meals = { ...meals, [day]: ta.value }; save(); stateSet('meals', meals); });
    card.append(head, ta); wrap.appendChild(card); mealBoxes[day] = ta;
  });
  const markToday = () => { const t = FULL[new Date().getDay()]; wrap.querySelectorAll('.meal').forEach((c) => c.classList.toggle('today', c.dataset.day === t)); };
  markToday(); onNewDay.push(markToday);
  store.watchMeals((m) => {
    meals = { ...Object.fromEntries(FULL.map((d) => [d, ''])), ...m }; stateSet('meals', meals);
    FULL.forEach((d) => { const ta = mealBoxes[d]; if (document.activeElement !== ta && ta.value !== (meals[d] || '')) ta.value = meals[d] || ''; });
  }, () => led('led-fb', store.configured ? 'err' : 'warn'));
}

/* ---------- chores ---------- */
const choresState = {}; const stateSnapshotChores = () => choresState;
{
  const wrap = $('kids');
  if (!KIDS.length) wrap.appendChild(el('div', 'empty', 'Add your kids in ⚙ Setup to use the chore board.'));
  KIDS.forEach((kid) => {
    const box = el('div', 'kid'); box.style.setProperty('--kid', kid.color);
    box.appendChild(el('div', 'kn', kid.name.toUpperCase()));
    const rows = []; let items = [];
    const write = () => store.setChores(kid.id, items).catch(() => toast('Save failed'));
    const writeText = debounce(write, 500);
    for (let i = 0; i < CHORES_PER_KID; i++) {
      const row = el('div', 'chore');
      const chk = el('button', 'chk'); chk.type = 'button'; chk.setAttribute('role', 'switch'); chk.setAttribute('aria-label', `${kid.name} chore ${i + 1} done`);
      const inp = el('input'); inp.type = 'text'; inp.placeholder = `Chore ${i + 1}…`; inp.autocomplete = 'off'; inp.setAttribute('aria-label', `${kid.name} chore ${i + 1}`);
      chk.addEventListener('click', () => { items[i] = { ...items[i], completed: !items[i].completed }; render(); write(); });
      inp.addEventListener('input', () => { items[i] = { ...items[i], text: inp.value }; row.classList.toggle('done', !!items[i].completed); writeText(); });
      row.append(chk, inp); box.appendChild(row); rows.push({ row, chk, inp });
    }
    const render = () => { const cur = stateSnapshotChores(); cur[kid.id] = { name: kid.name, items: items.map((it) => ({ ...it })) }; stateSet('chores', cur); rows.forEach((r, i) => {
      const it = items[i] || { id: i, text: '', completed: false };
      r.chk.classList.toggle('on', !!it.completed); r.chk.setAttribute('aria-checked', String(!!it.completed)); r.row.classList.toggle('done', !!it.completed);
      if (document.activeElement !== r.inp && r.inp.value !== (it.text || '')) r.inp.value = it.text || '';
    }); };
    store.watchChores(kid.id, (remote) => {
      if (remote === null) { items = Array.from({ length: CHORES_PER_KID }, (_, i) => ({ id: i, text: '', completed: false })); write(); }
      else { items = remote.slice(0, CHORES_PER_KID); while (items.length < CHORES_PER_KID) items.push({ id: items.length, text: '', completed: false }); }
      render();
    }, () => led('led-fb', store.configured ? 'err' : 'warn'));
    wrap.appendChild(box);
  });
}

/* ---------- calendar ---------- */
const cal = new Calendars(config);
const gcal = cal.google;   // null when Google is not configured
let events = [];      // normalised events from every provider (Google shape: start.date | start.dateTime)
let holidays = [];    // holiday events (read-only)
let expanded = [];    // per-day rows {ev, key, isHoliday, multi}
let viewYM = (() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; })();
let selected = new Date();
let editing = null;

function expandAll() {
  const out = [];
  const push = (ev, key, extra) => out.push({ ev, key, ...extra });
  events.forEach((ev) => {
    if (ev.start?.date) {
      const s = parseLocal(ev.start.date); const e = parseLocal(ev.end.date); e.setDate(e.getDate() - 1);
      const multi = s.getTime() !== e.getTime();
      for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) push(ev, dateKey(d), { multi });
    } else if (ev.start?.dateTime) {
      const s = new Date(ev.start.dateTime); const e = new Date(ev.end.dateTime);
      const sk = dateKey(s); const ek = dateKey(e);
      if (sk === ek) push(ev, sk, { multi: false });
      else { const d = new Date(s); d.setHours(0, 0, 0, 0); const en = new Date(e); en.setHours(0, 0, 0, 0); for (; d <= en; d.setDate(d.getDate() + 1)) push(ev, dateKey(d), { multi: true }); }
    }
  });
  holidays.forEach((h) => push(h, h.start?.date || dateKey(new Date(h.start.dateTime)), { isHoliday: true }));
  expanded = out;
}
const eventsOn = (key) => expanded.filter((r) => r.key === key);
const fmtTime = (ev) => {
  if (ev.start?.date) return 'ALL DAY';
  const f = (d) => new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '');
  return `${f(ev.start.dateTime)}`;
};

function renderMonth() {
  const grid = $('cal-grid'); grid.innerHTML = '';
  $('cal-month').textContent = `${MONTHS[viewYM.m].toUpperCase()} ${viewYM.y}`;
  const ws = display.weekStart;
  for (let i = 0; i < 7; i++) grid.appendChild(el('div', 'dow', DOW[(i + ws) % 7]));
  const first = new Date(viewYM.y, viewYM.m, 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay() - ws + 7) % 7));
  const selKey = dateKey(selected);
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = dateKey(d);
    const cell = el('div', 'day'); cell.setAttribute('role', 'gridcell'); cell.tabIndex = 0; cell.setAttribute('aria-label', d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
    cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cell.click(); } });
    if (d.getMonth() !== viewYM.m) cell.classList.add('other');
    if (d.getDay() === 0 || d.getDay() === 6) cell.classList.add('wknd');
    if (key === todayKey) cell.classList.add('today');
    if (key === selKey) cell.classList.add('sel');
    const rows = eventsOn(key);
    if (rows.some((r) => r.isHoliday)) cell.classList.add('holiday');
    cell.appendChild(el('div', 'num', d.getDate()));
    rows.slice(0, 3).forEach((r) => { const c = el('div', 'chip' + (r.isHoliday ? ' holiday' : ''), r.ev.summary || '(untitled)'); c.title = (r.ev.calendarName ? `${r.ev.calendarName}: ` : '') + (r.ev.summary || ''); if (r.ev.color) c.style.borderLeftColor = r.ev.color; cell.appendChild(c); });
    if (rows.length > 3) cell.appendChild(el('div', 'chip more', `+${rows.length - 3} more`));
    cell.addEventListener('click', () => { selected = d; if (d.getMonth() !== viewYM.m) viewYM = { y: d.getFullYear(), m: d.getMonth() }; renderAll(); });
    grid.appendChild(cell);
  }
}

function renderDay() {
  $('dp-dow').textContent = FULL[selected.getDay()].toUpperCase();
  $('dp-date').textContent = selected.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const list = $('dp-list'); list.innerHTML = '';
  if (authMsg) renderAuthPrompt(list);
  const rows = eventsOn(dateKey(selected));
  if (!rows.length) { list.appendChild(el('div', 'empty', 'No events')); return; }
  rows.forEach((r) => {
    const card = el('div', 'evt' + (r.isHoliday ? ' holiday' : '')); if (!r.isHoliday) { card.tabIndex = 0; card.setAttribute('role', 'button'); card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } }); }
    const when = el('div', 'when', r.isHoliday ? 'HOLIDAY' : fmtTime(r.ev)); if (r.ev.color && !r.isHoliday) when.style.background = r.ev.color; card.appendChild(when);
    const info = el('div', 'info'); info.appendChild(el('div', 'ttl', r.ev.summary || '(untitled)'));
    const sub = [r.ev.calendarName, r.ev.location, r.multi ? 'Multi-day' : ''].filter(Boolean).join(' • '); if (sub) info.appendChild(el('div', 'loc', sub));
    card.appendChild(info);
    if (!r.isHoliday) card.addEventListener('click', () => openModal(r.ev));
    list.appendChild(card);
  });
}

function renderWeek() {
  const wrap = $('week'); wrap.innerHTML = '';
  const today = new Date(); const selKey = dateKey(selected);
  for (let i = 0; i < 7; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i); const key = dateKey(d);
    const card = el('div', 'wday' + (i === 0 ? ' today' : '') + (key === selKey ? ' sel' : '')); card.tabIndex = 0; card.setAttribute('role', 'button'); card.setAttribute('aria-label', d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })); card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); } });
    const h = el('div', 'wh'); h.appendChild(el('span', 'dn', DOW[d.getDay()].toUpperCase())); h.appendChild(el('span', 'dd', d.getDate())); card.appendChild(h);
    const l = el('div', 'wl'); const rows = eventsOn(key);
    if (!rows.length) l.appendChild(el('span', 'empty', 'No events'));
    rows.slice(0, 3).forEach((r) => { const c = el('div', 'chip' + (r.isHoliday ? ' holiday' : ''), r.ev.summary || '(untitled)'); if (r.ev.color) c.style.borderLeftColor = r.ev.color; if (!r.isHoliday) c.addEventListener('click', (e) => { e.stopPropagation(); openModal(r.ev); }); l.appendChild(c); });
    if (rows.length > 3) l.appendChild(el('div', 'chip more', `+${rows.length - 3}`));
    card.appendChild(l);
    card.addEventListener('click', () => { selected = d; viewYM = { y: d.getFullYear(), m: d.getMonth() }; renderAll(); });
    wrap.appendChild(card);
  }
}
function renderAll() { renderMonth(); renderDay(); renderWeek(); }

async function loadEvents(showBusy = true) {
  if (showBusy) $('cal-refresh').disabled = true;
  try {
    if (gcal?.signedIn && !gcal.calendars.length) { await gcal.listCalendars(); renderCalSelect(); }
    const all = await cal.loadAll();
    events = all.filter((e) => !e.isHoliday); holidays = all.filter((e) => e.isHoliday); stateSet('events', events);
    expandAll(); renderAll(); beat('calendar', 15 * 60_000);
    const feedErr = Object.values(cal.status || {}).some((v) => typeof v === 'string');
    led('led-gc', feedErr ? 'warn' : ((gcal?.signedIn || cal.ics.length || cal.local) ? 'on' : ''));
    const parts = []; if (gcal?.signedIn) parts.push(gcal.calendars.find((c) => c.id === gcal.calendarId)?.summary || 'Google'); cal.ics.forEach((f) => parts.push(f.name)); cal.ha.forEach((f) => parts.push(f.name)); if (cal.local) parts.push(cal.local.name);
    $('cal-sub').textContent = parts.join(' + ') || 'No calendars';
    setWriteUI();
  } catch (e) {
    console.error('calendar load:', e); led('led-gc', 'err');
    if (e.status === 401) { setAuthUI(false, 'Session expired — sign in again'); } else toast('Calendar load failed');
  } finally { $('cal-refresh').disabled = false; }
}
function setWriteUI() { const w = cal.writable().length > 0; $('cal-add').hidden = !w; $('dp-add').hidden = !w; }
cal.onLocalChange = () => loadEvents(false);
function renderCalSelect() {
  const sel = $('cal-select'); sel.innerHTML = '';
  gcal.calendars.forEach((c) => { const o = el('option', null, c.summary + (c.primary ? ' (Primary)' : '')); o.value = c.id; sel.appendChild(o); });
  sel.value = gcal.calendarId; sel.hidden = gcal.calendars.length < 2;
}
$('cal-select').addEventListener('change', (e) => { gcal.calendarId = e.target.value; loadEvents(); });
$('cal-refresh').hidden = false;
$('cal-refresh').addEventListener('click', () => loadEvents());
$('cal-signout').addEventListener('click', () => gcal?.signOut());
$('cal-prev').addEventListener('click', () => { viewYM.m--; if (viewYM.m < 0) { viewYM.m = 11; viewYM.y--; } renderMonth(); });
$('cal-next').addEventListener('click', () => { viewYM.m++; if (viewYM.m > 11) { viewYM.m = 0; viewYM.y++; } renderMonth(); });
$('cal-today').addEventListener('click', () => { const n = new Date(); selected = n; viewYM = { y: n.getFullYear(), m: n.getMonth() }; renderAll(); });
$('cal-add').addEventListener('click', () => openModal(null));
$('dp-add').addEventListener('click', () => openModal(null));

let authMsg = null;   // set while Google is configured but not signed in
function setAuthUI(signedIn, msg) {
  $('cal-signout').hidden = !signedIn; $('cal-refresh').hidden = false;
  if (signedIn || !cal.hasGoogle) { authMsg = null; }
  else { authMsg = { text: 'Sign in to see your Google Calendar too', err: msg || '' }; led('led-gc', ''); }
  setWriteUI(); loadEvents(false);
}
function renderAuthPrompt(list) {
  const g = el('div', 'gstate compact');
  g.appendChild(el('div', null, authMsg.text));
  const b = el('button', 'btn sm', 'Sign in with Google'); b.type = 'button'; b.addEventListener('click', () => gcal.requestToken(false)); g.appendChild(b);
  if (authMsg.err) g.appendChild(el('div', 'err', authMsg.err));
  list.appendChild(g);
}

/* event modal */
const allday = $('ev-allday');
const setAllDay = (v) => { allday.classList.toggle('on', v); allday.setAttribute('aria-checked', String(v)); document.querySelectorAll('#evt-form .timed').forEach((l) => { l.style.visibility = v ? 'hidden' : 'visible'; }); };
allday.addEventListener('click', () => setAllDay(!allday.classList.contains('on')));
allday.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); allday.click(); } });
function openModal(ev) {
  editing = ev;
  const ro = !!ev?.readOnly;
  $('evt-title').textContent = ev ? (ro ? `${ev.calendarName || 'Feed'} event (read-only)` : 'Edit Event') : 'New Event';
  $('ev-delete').hidden = !ev || ro; $('ev-save').hidden = ro;
  document.querySelectorAll('#evt-form input, #evt-form textarea').forEach((i) => { i.disabled = ro; });
  const targets = cal.writable(); const tw = $('ev-target-wrap'); const ts = $('ev-target');
  tw.hidden = !!ev || targets.length < 2; ts.innerHTML = ''; targets.forEach((t) => { const o = el('option', null, t.name); o.value = t.id; ts.appendChild(o); });
  if (!ev && targets.length) ts.value = targets[0].id;
  const k = dateKey(selected);
  if (!ev) { $('ev-summary').value = ''; $('ev-loc').value = ''; $('ev-desc').value = ''; $('ev-sdate').value = k; $('ev-edate').value = k; $('ev-stime').value = '09:00'; $('ev-etime').value = '10:00'; setAllDay(false); }
  else {
    $('ev-summary').value = ev.summary || ''; $('ev-loc').value = ev.location || ''; $('ev-desc').value = ev.description || '';
    if (ev.start?.date) { const e = parseLocal(ev.end.date); e.setDate(e.getDate() - 1); $('ev-sdate').value = ev.start.date; $('ev-edate').value = dateKey(e); $('ev-stime').value = '09:00'; $('ev-etime').value = '10:00'; setAllDay(true); }
    else { const s = new Date(ev.start.dateTime); const e = new Date(ev.end.dateTime); $('ev-sdate').value = dateKey(s); $('ev-edate').value = dateKey(e); $('ev-stime').value = `${pad(s.getHours())}:${pad(s.getMinutes())}`; $('ev-etime').value = `${pad(e.getHours())}:${pad(e.getMinutes())}`; setAllDay(false); }
  }
  $('evt-overlay').hidden = false; setTimeout(() => $('ev-summary').focus(), 30);
}
const closeModal = () => { $('evt-overlay').hidden = true; editing = null; };
$('evt-close').addEventListener('click', closeModal); $('ev-cancel').addEventListener('click', closeModal);
$('evt-overlay').addEventListener('click', (e) => { if (e.target === $('evt-overlay')) closeModal(); });
$('evt-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const summary = $('ev-summary').value.trim(); if (!summary) return;
  const isAllDay = allday.classList.contains('on');
  let resource;
  if (isAllDay) { const en = parseLocal($('ev-edate').value); en.setDate(en.getDate() + 1); resource = { summary, description: $('ev-desc').value, location: $('ev-loc').value, start: { date: $('ev-sdate').value }, end: { date: dateKey(en) } }; }
  else {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const s = new Date(`${$('ev-sdate').value}T${$('ev-stime').value}`); const en = new Date(`${$('ev-edate').value}T${$('ev-etime').value}`);
    resource = { summary, description: $('ev-desc').value, location: $('ev-loc').value, start: { dateTime: s.toISOString(), timeZone: tz }, end: { dateTime: en.toISOString(), timeZone: tz } };
  }
  $('ev-save').disabled = true;
  try { if (editing) await cal.update(editing, resource); else await cal.insert($('ev-target').value || cal.writable()[0]?.id, resource); closeModal(); toast(editing ? 'Event updated' : 'Event added'); await loadEvents(false); }
  catch (err) { console.error(err); toast('Save failed'); }
  finally { $('ev-save').disabled = false; }
});
$('ev-delete').addEventListener('click', async () => {
  if (!editing || !window.confirm('Delete this event?')) return;
  try { await cal.remove(editing); closeModal(); toast('Event deleted'); await loadEvents(false); } catch (err) { console.error(err); toast('Delete failed'); }
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('evt-overlay').hidden) closeModal(); });

/* boot calendars */
renderAll();
(async () => {
  if (!gcal) { setAuthUI(false); return; }
  try {
    await gcal.init();
    gcal.onAuthChange = (ok, err) => { setAuthUI(ok, err ? 'Sign-in failed' : ''); };
    setAuthUI(false);
    try { gcal.requestToken(true); } catch (e) { console.log('silent auth unavailable'); }   // silent re-auth when this browser already granted access
  } catch (e) {
    console.error('gapi init:', e); led('led-gc', 'err'); authMsg = { text: 'Google Calendar unavailable', err: `Google API failed to load: ${e.message}` }; loadEvents(false);
  }
})();
onNewDay.push(() => { const n = new Date(); selected = n; viewYM = { y: n.getFullYear(), m: n.getMonth() }; renderAll(); });
setInterval(() => loadEvents(false), 15 * 60 * 1000);   // keep the wall display fresh
