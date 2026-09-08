// Loads site config with graceful fallbacks so the app boots even before setup:
//   defaults  <  web/config.js (if present)  <  localStorage override (set by the setup wizard
//   when no server-side save is possible, e.g. a static host).
export const DEFAULTS = {
  family: { title: 'FAMILY', subtitle: 'PLANNER', footer: ['FREE FAMILY PLANNER'], kids: [] },
  location: { label: '', lat: null, lon: null },
  firebase: { apiKey: '', authDomain: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: '' },
  backend: '',           // 'firestore' | 'sync' | 'local' — blank = firestore if configured, else local
  googleClientId: '',
  holidayCalendarId: 'en.usa#holiday@group.v.calendar.google.com',
  calendars: [{ type: 'local', name: 'Family', color: '#2bff66' }],
  weather: { provider: 'auto', screens: {}, speed: 1, scanLines: false },
  house: { tiles: [] },
  defaultMode: 'both',   // 'family' | 'command' | 'both' — what a new display shows (each display can override in ☰ Display)   // home-hub tiles: [{ entity, label, kind? }] — the hub URL/token live server-side, never here
};
export const LS_KEY = 'fp.config';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
export function deepMerge(base, ...layers) {
  const out = structuredClone(base);
  for (const layer of layers) {
    if (!isObj(layer)) continue;
    for (const [k, v] of Object.entries(layer)) {
      if (isObj(v) && isObj(out[k])) out[k] = deepMerge(out[k], v);
      else if (v !== undefined) out[k] = structuredClone(v);
    }
  }
  return out;
}

export async function loadConfig() {
  let file = {}; let source = 'defaults';
  try { file = (await import('../../config.js')).default || {}; source = 'config.js'; }
  catch (e) { console.warn('config.js not loaded (run the ⚙ setup wizard):', e.message); }
  let local = {};
  try { local = JSON.parse(localStorage.getItem(LS_KEY) || 'null') || {}; if (Object.keys(local).length) source += '+localStorage'; } catch { /* ignore */ }
  const cfg = deepMerge(DEFAULTS, file, local);
  cfg.__source = source;
  cfg.__hasFile = source.startsWith('config.js');
  return cfg;
}

export const isConfigured = (cfg) => !!(cfg.firebase?.apiKey || cfg.googleClientId || (cfg.location?.lat != null));
