// Family Central Command — vanilla canvas build (no framework).
import * as store from './store.js?v=3';
import { GCal } from './gcal.js?v=3';
import { currentConditions } from './wx.js?v=3';
import config from '../../config.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseLocal = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const KIDS = config.family.kids;
const CHORES_PER_KID = 3;

/* ---------- branding from config ---------- */
document.title = `${config.family.title} — ${config.family.subtitle}`;
$('hdr-title').firstChild.textContent = config.family.title;
$('hdr-subtitle').textContent = config.family.subtitle;
$('wx-place').textContent = config.location.label;
{ const f = $('status-footer'); f.innerHTML = ''; (config.family.footer || []).forEach((t, i) => { if (i) f.appendChild(el('span', 'sep', '•')); f.appendChild(el('span', null, t)); }); }

/* ---------- canvas scaler: design canvas fitted to any display ---------- */
function fitCanvas() {
  const portrait = window.innerHeight > window.innerWidth;
  const c = $('canvas'); c.classList.toggle('portrait', portrait);
  const [w, h] = portrait ? [1080, 1920] : [1920, 1080];
  const s = Math.min(window.innerWidth / w, window.innerHeight / h);
  c.style.transform = `scale(${s})`;
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

/* ---------- toast + LEDs ---------- */
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
function led(id, state) { const e = $(id); e.className = 'led' + (state ? ` ${state}` : ''); }

/* ---------- clock / date / midnight rollover ---------- */
let todayKey = dateKey(new Date());
const onNewDay = [];
function tickClock() {
  const now = new Date();
  let h = now.getHours(); const ampm = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  $('hdr-clock').textContent = `${pad(h)}:${pad(now.getMinutes())}`;
  $('hdr-ampm').textContent = ampm;
  $('hdr-date').textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  const k = dateKey(now);
  if (k !== todayKey) { todayKey = k; onNewDay.forEach((f) => f()); }
}
setInterval(tickClock, 1000);
tickClock();

/* ---------- fullscreen ---------- */
$('btn-full').addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.();
});

/* ---------- outside temp (NWS) ---------- */
async function refreshWx() {
  try {
    const w = await currentConditions();
    $('hdr-temp').textContent = w.tempF;
    $('hdr-cond').textContent = w.cond;
    led('led-wx', 'on');
  } catch (e) { console.warn('NWS:', e); led('led-wx', 'warn'); }
}
refreshWx();
setInterval(refreshWx, 10 * 60 * 1000);

/* ---------- WeatherStar 4000+ (clean upstream ws4kp build, kiosk mode) ---------- */
{
  const latLon = encodeURIComponent(JSON.stringify({ lat: config.location.lat, lon: config.location.lon }));
  $('wx-frame').src = `ws4kp/index.html?settings-kiosk-checkbox=true&settings-units-select=us&latLon=${latLon}&v=4`;
}

/* ---------- check lists: shopping + notes ---------- */
function bindList(name, formId, inputId, listId, countId) {
  const list = $(listId); const input = $(inputId);
  $(formId).addEventListener('submit', async (e) => {
    e.preventDefault(); const text = input.value.trim(); if (!text) return;
    input.value = '';
    try { await store.addListItem(name, text); } catch (err) { toast('Save failed'); console.error(err); }
  });
  store.watchList(name, (items) => {
    led('led-fb', 'on');
    list.innerHTML = '';
    if (!items.length) { list.appendChild(el('li', 'empty', 'Nothing here.')); }
    items.forEach((it) => {
      const li = el('li', it.completed ? 'done' : '');
      const chk = el('button', 'chk' + (it.completed ? ' on' : '')); chk.type = 'button'; chk.title = 'Done';
      chk.addEventListener('click', () => store.toggleListItem(name, it.id, !!it.completed));
      const txt = el('span', 'txt', it.text);
      const del = el('button', 'del', '×'); del.type = 'button'; del.title = 'Remove';
      del.addEventListener('click', () => store.deleteListItem(name, it.id));
      li.append(chk, txt, del); list.appendChild(li);
    });
    if (countId) { const open = items.filter((i) => !i.completed).length; $(countId).textContent = items.length ? `${open} open / ${items.length}` : ''; }
  }, () => led('led-fb', store.configured ? 'err' : 'warn'));
}
if (!store.configured) led('led-fb', 'warn');
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
    const clr = el('button', 'clr', '×'); clr.type = 'button'; clr.title = 'Clear';
    clr.addEventListener('click', () => { meals = { ...meals, [day]: '' }; mealBoxes[day].value = ''; store.saveMeals(meals).catch(() => toast('Save failed')); });
    head.appendChild(clr);
    const ta = el('textarea'); ta.placeholder = '…'; ta.rows = 3;
    const save = debounce(() => store.saveMeals(meals).catch(() => toast('Save failed')), 500);
    ta.addEventListener('input', () => { meals = { ...meals, [day]: ta.value }; save(); });
    card.append(head, ta); wrap.appendChild(card); mealBoxes[day] = ta;
  });
  const markToday = () => { const t = FULL[new Date().getDay()]; wrap.querySelectorAll('.meal').forEach((c) => c.classList.toggle('today', c.dataset.day === t)); };
  markToday(); onNewDay.push(markToday);
  store.watchMeals((m) => {
    meals = { ...Object.fromEntries(FULL.map((d) => [d, ''])), ...m };
    FULL.forEach((d) => { const ta = mealBoxes[d]; if (document.activeElement !== ta && ta.value !== (meals[d] || '')) ta.value = meals[d] || ''; });
  }, () => led('led-fb', store.configured ? 'err' : 'warn'));
}

/* ---------- chores ---------- */
{
  const wrap = $('kids');
  KIDS.forEach((kid) => {
    const box = el('div', 'kid'); box.style.setProperty('--kid', kid.color);
    box.appendChild(el('div', 'kn', kid.name.toUpperCase()));
    const rows = []; let items = [];
    const write = () => store.setChores(kid.id, items).catch(() => toast('Save failed'));
    const writeText = debounce(write, 500);
    for (let i = 0; i < CHORES_PER_KID; i++) {
      const row = el('div', 'chore');
      const chk = el('button', 'chk'); chk.type = 'button';
      const inp = el('input'); inp.type = 'text'; inp.placeholder = `Chore ${i + 1}…`; inp.autocomplete = 'off';
      chk.addEventListener('click', () => { items[i] = { ...items[i], completed: !items[i].completed }; render(); write(); });
      inp.addEventListener('input', () => { items[i] = { ...items[i], text: inp.value }; row.classList.toggle('done', !!items[i].completed); writeText(); });
      row.append(chk, inp); box.appendChild(row); rows.push({ row, chk, inp });
    }
    const render = () => rows.forEach((r, i) => {
      const it = items[i] || { id: i, text: '', completed: false };
      r.chk.classList.toggle('on', !!it.completed); r.row.classList.toggle('done', !!it.completed);
      if (document.activeElement !== r.inp && r.inp.value !== (it.text || '')) r.inp.value = it.text || '';
    });
    store.watchChores(kid.id, (remote) => {
      if (remote === null) { items = Array.from({ length: CHORES_PER_KID }, (_, i) => ({ id: i, text: '', completed: false })); write(); }
      else { items = remote.slice(0, CHORES_PER_KID); while (items.length < CHORES_PER_KID) items.push({ id: items.length, text: '', completed: false }); }
      render();
    }, () => led('led-fb', store.configured ? 'err' : 'warn'));
    wrap.appendChild(box);
  });
}

/* ---------- calendar ---------- */
const gcal = new GCal();
let events = [];      // raw Google events (selected calendar)
let holidays = [];    // raw holiday events
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
  DOW.forEach((d) => grid.appendChild(el('div', 'dow', d)));
  const first = new Date(viewYM.y, viewYM.m, 1);
  const start = new Date(first); start.setDate(1 - first.getDay());
  const selKey = dateKey(selected);
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = dateKey(d);
    const cell = el('div', 'day');
    if (d.getMonth() !== viewYM.m) cell.classList.add('other');
    if (d.getDay() === 0 || d.getDay() === 6) cell.classList.add('wknd');
    if (key === todayKey) cell.classList.add('today');
    if (key === selKey) cell.classList.add('sel');
    const rows = eventsOn(key);
    if (rows.some((r) => r.isHoliday)) cell.classList.add('holiday');
    cell.appendChild(el('div', 'num', d.getDate()));
    rows.slice(0, 3).forEach((r) => { const c = el('div', 'chip' + (r.isHoliday ? ' holiday' : ''), r.ev.summary || '(untitled)'); c.title = r.ev.summary || ''; cell.appendChild(c); });
    if (rows.length > 3) cell.appendChild(el('div', 'chip more', `+${rows.length - 3} more`));
    cell.addEventListener('click', () => { selected = d; if (d.getMonth() !== viewYM.m) viewYM = { y: d.getFullYear(), m: d.getMonth() }; renderAll(); });
    grid.appendChild(cell);
  }
}

function renderDay() {
  $('dp-dow').textContent = FULL[selected.getDay()].toUpperCase();
  $('dp-date').textContent = selected.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const list = $('dp-list'); list.innerHTML = '';
  if (authMsg) { renderAuthPrompt(list); return; }
  const rows = eventsOn(dateKey(selected));
  if (!rows.length) { list.appendChild(el('div', 'empty', 'No events')); return; }
  rows.forEach((r) => {
    const card = el('div', 'evt' + (r.isHoliday ? ' holiday' : ''));
    card.appendChild(el('div', 'when', r.isHoliday ? 'HOLIDAY' : fmtTime(r.ev)));
    const info = el('div', 'info'); info.appendChild(el('div', 'ttl', r.ev.summary || '(untitled)'));
    const sub = [r.ev.location, r.multi ? 'Multi-day' : ''].filter(Boolean).join(' • '); if (sub) info.appendChild(el('div', 'loc', sub));
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
    const card = el('div', 'wday' + (i === 0 ? ' today' : '') + (key === selKey ? ' sel' : ''));
    const h = el('div', 'wh'); h.appendChild(el('span', 'dn', DOW[d.getDay()].toUpperCase())); h.appendChild(el('span', 'dd', d.getDate())); card.appendChild(h);
    const l = el('div', 'wl'); const rows = eventsOn(key);
    if (!rows.length) l.appendChild(el('span', 'empty', authMsg ? '—' : 'No events'));
    rows.slice(0, 3).forEach((r) => { const c = el('div', 'chip' + (r.isHoliday ? ' holiday' : ''), r.ev.summary || '(untitled)'); if (!r.isHoliday) c.addEventListener('click', (e) => { e.stopPropagation(); openModal(r.ev); }); l.appendChild(c); });
    if (rows.length > 3) l.appendChild(el('div', 'chip more', `+${rows.length - 3}`));
    card.appendChild(l);
    card.addEventListener('click', () => { selected = d; viewYM = { y: d.getFullYear(), m: d.getMonth() }; renderAll(); });
    wrap.appendChild(card);
  }
}
function renderAll() { renderMonth(); renderDay(); renderWeek(); }

async function loadEvents(showBusy = true) {
  if (!gcal.signedIn) return;
  if (showBusy) $('cal-refresh').disabled = true;
  try {
    if (!gcal.calendars.length) { await gcal.listCalendars(); renderCalSelect(); }
    [events, holidays] = await Promise.all([gcal.listEvents(), gcal.listHolidays()]);
    expandAll(); renderAll(); led('led-gc', 'on');
    $('cal-sub').textContent = gcal.calendars.find((c) => c.id === gcal.calendarId)?.summary || 'Google Calendar';
  } catch (e) {
    console.error('calendar load:', e); led('led-gc', 'err');
    if (e.status === 401) { setAuthUI(false, 'Session expired — sign in again'); } else toast('Calendar load failed');
  } finally { $('cal-refresh').disabled = false; }
}
function renderCalSelect() {
  const sel = $('cal-select'); sel.innerHTML = '';
  gcal.calendars.forEach((c) => { const o = el('option', null, c.summary + (c.primary ? ' (Primary)' : '')); o.value = c.id; sel.appendChild(o); });
  sel.value = gcal.calendarId; sel.hidden = gcal.calendars.length < 2;
}
$('cal-select').addEventListener('change', (e) => { gcal.calendarId = e.target.value; loadEvents(); });
$('cal-refresh').addEventListener('click', () => loadEvents());
$('cal-signout').addEventListener('click', () => gcal.signOut());
$('cal-prev').addEventListener('click', () => { viewYM.m--; if (viewYM.m < 0) { viewYM.m = 11; viewYM.y--; } renderMonth(); });
$('cal-next').addEventListener('click', () => { viewYM.m++; if (viewYM.m > 11) { viewYM.m = 0; viewYM.y++; } renderMonth(); });
$('cal-today').addEventListener('click', () => { const n = new Date(); selected = n; viewYM = { y: n.getFullYear(), m: n.getMonth() }; renderAll(); });
$('cal-add').addEventListener('click', () => openModal(null));
$('dp-add').addEventListener('click', () => openModal(null));

let authMsg = null;   // null = signed in; otherwise {text, err?} shown in the day pane
function setAuthUI(signedIn, msg) {
  $('cal-signout').hidden = !signedIn; $('cal-add').hidden = !signedIn; $('cal-refresh').hidden = !signedIn; $('dp-add').hidden = !signedIn;
  if (signedIn) { authMsg = null; }
  else { authMsg = { text: 'Connect Google Calendar to see and manage family events', err: msg || '' }; events = []; holidays = []; expandAll(); led('led-gc', ''); $('cal-sub').textContent = 'Google Calendar'; }
  renderAll();
}
function renderAuthPrompt(list) {
  const g = el('div', 'gstate');
  g.appendChild(el('div', null, authMsg.text));
  const b = el('button', 'btn', 'Sign in with Google'); b.type = 'button'; b.addEventListener('click', () => gcal.requestToken(false)); g.appendChild(b);
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
  $('evt-title').textContent = ev ? 'Edit Event' : 'New Event';
  $('ev-delete').hidden = !ev;
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
  try { if (editing) await gcal.update(editing.id, resource); else await gcal.insert(resource); closeModal(); toast(editing ? 'Event updated' : 'Event added'); await loadEvents(false); }
  catch (err) { console.error(err); toast('Save failed'); }
  finally { $('ev-save').disabled = false; }
});
$('ev-delete').addEventListener('click', async () => {
  if (!editing || !window.confirm('Delete this event?')) return;
  try { await gcal.remove(editing.id); closeModal(); toast('Event deleted'); await loadEvents(false); } catch (err) { console.error(err); toast('Delete failed'); }
});
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('evt-overlay').hidden) closeModal(); });

/* boot calendar */
authMsg = { text: 'Connecting to Google Calendar…', err: '' };
renderAll();
(async () => {
  if (!config.googleClientId) { authMsg = { text: 'Google Calendar not configured', err: 'Set googleClientId in config.js' }; renderAll(); led('led-gc', 'warn'); return; }
  try {
    await gcal.init();
    gcal.onAuthChange = (ok, err) => { if (ok) { setAuthUI(true); loadEvents(); } else setAuthUI(false, err ? 'Sign-in failed' : ''); };
    setAuthUI(false);
    // silent re-auth like the old build: works when this browser already granted access
    try { gcal.requestToken(true); } catch (e) { console.log('silent auth unavailable'); }
  } catch (e) {
    console.error('gapi init:', e); led('led-gc', 'err');
    authMsg = { text: 'Google Calendar unavailable', err: `Google API failed to load: ${e.message}` }; renderAll();
  }
})();
onNewDay.push(() => { const n = new Date(); selected = n; viewYM = { y: n.getFullYear(), m: n.getMonth() }; renderAll(); });
setInterval(() => loadEvents(false), 15 * 60 * 1000);   // keep the wall display fresh
