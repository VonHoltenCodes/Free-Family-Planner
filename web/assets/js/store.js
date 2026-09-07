// Data layer facade. Picks a backend from config.backend:
//   'firestore' — Firebase Firestore (cloud, real-time, phones + wall in sync)
//   'sync'      — self-hosted store on this server (web/api/db.php or tools/serve.py), no cloud
//   'local'     — this browser only (localStorage), zero setup
// Every backend exposes the same API; planner.js never sees which one is active.
import * as firestore from './backends/firestore.js';
import * as sync from './backends/sync.js';
import * as local from './backends/local.js';

export const BACKENDS = { firestore, sync, local };
let impl = null;
export let configured = false;
export let backendName = 'none';

export function initStore(config) {
  const choice = config.backend || (config.firebase?.apiKey ? 'firestore' : 'local');
  try {
    if (choice === 'firestore') {
      if (!(config.firebase?.apiKey && config.firebase?.projectId)) throw new Error('Firebase not configured');
      impl = firestore.create(config.firebase);
    } else if (choice === 'sync') impl = sync.create();
    else impl = local.create();
    configured = true; backendName = impl.name;
  } catch (e) { console.warn('data backend unavailable:', e.message); impl = null; configured = false; }
  return configured;
}
export const testFirebase = (cfg) => firestore.testConnection(cfg);
export const testSync = () => sync.testConnection();

const off = () => () => {};
const nope = () => Promise.reject(new Error('data backend not configured'));
export const watchList = (col, onItems, onError) => (impl ? impl.watchList(col, onItems, onError) : (onItems([]), onError?.(new Error('not configured')), off()));
export const addListItem = (col, text) => (impl ? impl.addListItem(col, text) : nope());
export const toggleListItem = (col, id, completed) => (impl ? impl.toggleListItem(col, id, completed) : nope());
export const deleteListItem = (col, id) => (impl ? impl.deleteListItem(col, id) : nope());
export const watchMeals = (onMeals, onError) => (impl ? impl.watchMeals(onMeals, onError) : (onMeals({}), onError?.(new Error('not configured')), off()));
export const saveMeals = (meals) => (impl ? impl.saveMeals(meals) : nope());
export const watchChores = (kidId, onItems, onError) => (impl ? impl.watchChores(kidId, onItems, onError) : (onItems([]), onError?.(new Error('not configured')), off()));
export const setChores = (kidId, items) => (impl ? impl.setChores(kidId, items) : nope());
export const watchEvents = (onItems, onError) => (impl ? impl.watchEvents(onItems, onError) : (onItems([]), off()));
export const putEvent = (id, ev) => (impl ? impl.putEvent(id, ev) : nope());
export const deleteEvent = (id) => (impl ? impl.deleteEvent(id) : nope());
