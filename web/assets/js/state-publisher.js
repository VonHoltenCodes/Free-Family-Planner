// Publishes a small read-only snapshot of what the wall shows to the server (PUT api/state.php),
// so home hubs (Home Assistant's REST sensor, Home-IO) can read "tonight's dinner", open shopping
// items, chores done, next events and the outside temperature without any integration to install.
const snap = { meals: {}, shopping: [], notes: [], chores: {}, events: [], weather: null, family: {}, power: null, health: null };
let timer = null; let lastSent = 0; let enabled = true;
const FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const stateSnapshot = snap;
export function stateSet(key, value) { snap[key] = value; schedule(3000); }
function schedule(ms) { if (!enabled) return; clearTimeout(timer); timer = setTimeout(publish, ms); }

function build() {
  const today = FULL[new Date().getDay()]; const now = Date.now();
  const evs = (snap.events || []).map((e) => ({ summary: e.summary || '', calendar: e.calendarName || e.provider || '', allDay: !!e.start?.date, start: e.start?.date || e.start?.dateTime, end: e.end?.date || e.end?.dateTime, location: e.location || '' }))
    .filter((e) => new Date(e.allDay ? `${e.end}T00:00:00` : e.end).getTime() >= now).sort((a, b) => new Date(a.start) - new Date(b.start)).slice(0, 8);
  const list = (items) => ({ open: items.filter((i) => !i.completed).length, total: items.length, items: items.map((i) => ({ text: i.text, completed: !!i.completed })) });
  return {
    updatedAt: new Date().toISOString(), source: 'display', family: snap.family,
    meals: { today: snap.meals?.[today] || '', todayName: today, week: Object.fromEntries(FULL.map((d) => [d, snap.meals?.[d] || ''])) },
    shopping: list(snap.shopping || []), notes: list(snap.notes || []),
    chores: Object.fromEntries(Object.entries(snap.chores || {}).map(([id, k]) => [id, { name: k.name, done: k.items.filter((c) => c.completed && c.text).length, total: k.items.filter((c) => c.text).length, items: k.items.filter((c) => c.text).map((c) => ({ text: c.text, completed: !!c.completed })) }])),
    events: evs, weather: snap.weather, power: snap.power,
    display: snap.display,   // viewport diagnostics from the wall (helps support layout issues)
    health: snap.health,     // uptime, heartbeats, recent errors (see watchdog.js)
  };
}
async function publish() {
  try {
    const r = await fetch('api/state.php', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(build()), cache: 'no-store' });
    if (r.status === 404 || r.status === 405) { enabled = false; return; }   // static host: nothing to publish to
    lastSent = Date.now();
  } catch (e) { console.warn('state publish:', e.message); }
}
setInterval(() => { if (Date.now() - lastSent > 60_000) publish(); }, 60_000);
setTimeout(publish, 8000);
