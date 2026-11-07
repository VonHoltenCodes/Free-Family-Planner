// Browser-local backend: everything in localStorage on this one display. Zero setup, no sync.
// Other tabs on the same device stay in sync through the `storage` event.
// createMemory() is the same store without the saving: demo mode runs on it.
export const name = 'local';
const KEY = 'fp.data';
const fresh = (d) => ({ notes: {}, shopping: {}, meals: {}, chores: {}, events: {}, ...d });
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch { return {}; } };
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function build(backendName, initial, save) {
  let data = fresh(initial);
  const watchers = new Set();
  const notify = () => watchers.forEach((w) => { try { w(); } catch (e) { console.error(e); } });
  const persist = () => { save(data); notify(); };
  const watch = (fn, onItems) => { const run = () => onItems(fn()); watchers.add(run); run(); return () => watchers.delete(run); };
  const listItems = (col) => Object.entries(data[col] || {}).map(([id, v]) => ({ id, ...v })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return {
    name: backendName,
    replace: (d) => { data = fresh(d); notify(); },
    watchList: (col, onItems) => watch(() => listItems(col), onItems),
    addListItem: async (col, text) => { data[col] = data[col] || {}; data[col][newId()] = { text, completed: false, createdAt: new Date().toISOString() }; persist(); },
    toggleListItem: async (col, id, completed) => { if (data[col]?.[id]) { data[col][id].completed = !completed; persist(); } },
    deleteListItem: async (col, id) => { if (data[col]) { delete data[col][id]; persist(); } },
    watchMeals: (onMeals) => watch(() => ({ ...data.meals }), onMeals),
    saveMeals: async (meals) => { data.meals = { ...meals }; persist(); },
    watchChores: (kidId, onItems) => watch(() => (data.chores[kidId] ? [...data.chores[kidId]] : null), onItems),
    setChores: async (kidId, items) => { data.chores[kidId] = items.map((i) => ({ ...i })); persist(); },
    watchEvents: (onItems) => watch(() => Object.entries(data.events).map(([id, v]) => ({ id, ...v })), onItems),
    putEvent: async (id, ev) => { data.events[id] = { ...ev }; persist(); },
    deleteEvent: async (id) => { delete data.events[id]; persist(); },
  };
}

export function create() {
  const b = build(name, load(), (d) => localStorage.setItem(KEY, JSON.stringify(d)));
  window.addEventListener('storage', (e) => { if (e.key === KEY) b.replace(load()); });
  return b;
}
/* In-memory only: starts from `seed`, edits live until the next reload, nothing is stored anywhere. */
export function createMemory(backendName, seed) { return build(backendName, seed, () => {}); }
