// Self-hosted sync backend: a tiny document store on the same server that serves the page
// (web/api/db.php on a PHP host, or the same route inside tools/serve.py). Phones and the wall
// share it without any cloud account. Realtime = polling a revision counter every few seconds.
export const name = 'sync';
const API = 'api/db.php';
const POLL_MS = 3000;

async function call(method, params, body) {
  const q = new URLSearchParams(params).toString();
  const r = await fetch(`${API}?${q}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  if (!r.ok) throw new Error(`sync server ${r.status}`);
  return r.json();
}
export async function testConnection() {
  const r = await call('GET', { rev: 1 });
  return `sync store reachable (revision ${r.rev})`;
}

export function create() {
  let state = { notes: {}, shopping: {}, settings: {}, chores: {}, events: {} }; let rev = -1;
  const watchers = new Set(); const errWatchers = new Set();
  const notify = () => watchers.forEach((w) => { try { w(); } catch (e) { console.error(e); } });
  const refresh = async () => { const r = await call('GET', { all: 1 }); state = { notes: {}, shopping: {}, settings: {}, chores: {}, events: {}, ...r.data }; rev = r.rev; notify(); };
  const poll = async () => { try { const r = await call('GET', { rev: 1 }); if (r.rev !== rev) await refresh(); } catch (e) { errWatchers.forEach((f) => f(e)); } };
  refresh().catch((e) => errWatchers.forEach((f) => f(e))); setInterval(poll, POLL_MS);
  const watch = (fn, onItems, onError) => { const run = () => onItems(fn()); watchers.add(run); if (onError) errWatchers.add(onError); if (rev >= 0) run(); return () => { watchers.delete(run); errWatchers.delete(onError); }; };
  const listItems = (col) => Object.entries(state[col] || {}).map(([id, v]) => ({ id, ...v })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const put = async (col, id, doc) => { const r = await call('PUT', { c: col, id }, doc); state[col] = state[col] || {}; state[col][id] = doc; rev = r.rev; notify(); };
  const del = async (col, id) => { const r = await call('DELETE', { c: col, id }); if (state[col]) delete state[col][id]; rev = r.rev; notify(); };
  const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return {
    name,
    watchList: (col, onItems, onError) => watch(() => listItems(col), onItems, onError),
    addListItem: (col, text) => put(col, newId(), { text, completed: false, createdAt: new Date().toISOString() }),
    toggleListItem: (col, id, completed) => put(col, id, { ...state[col][id], completed: !completed }),
    deleteListItem: (col, id) => del(col, id),
    watchMeals: (onMeals, onError) => watch(() => ({ ...(state.settings.weeklyMeals || {}) }), onMeals, onError),
    saveMeals: (meals) => put('settings', 'weeklyMeals', { ...meals }),
    watchChores: (kidId, onItems, onError) => watch(() => (state.chores[kidId] ? [...state.chores[kidId].items] : null), onItems, onError),
    setChores: (kidId, items) => put('chores', kidId, { items }),
    watchEvents: (onItems, onError) => watch(() => Object.entries(state.events).map(([id, v]) => ({ id, ...v })), onItems, onError),
    putEvent: (id, ev) => put('events', id, ev),
    deleteEvent: (id) => del('events', id),
  };
}
