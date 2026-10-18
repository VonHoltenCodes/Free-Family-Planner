// Loads site config with graceful fallbacks so the app boots even before setup:
//   defaults  <  web/config.js (if present)  <  localStorage override (set by the setup wizard
//   when no server-side save is possible, e.g. a static host).
export const DEFAULTS = {
  family: { title: 'FAMILY', subtitle: 'PLANNER', footer: ['FREE FAMILY PLANNER'], kids: [] },
  location: { label: '', lat: null, lon: null },
  firebase: { apiKey: '', authDomain: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: '' },
  backend: '',           // 'firestore' | 'sync' | 'local' — blank = firestore if configured, else local
  googleClientId: '',   // browser sign-in flow (legacy)
  google: { mode: 'none' },   // 'server' = the server holds the OAuth refresh token (best for a wall display)
  holidayCalendarId: 'en.usa#holiday@group.v.calendar.google.com',
  calendars: [{ type: 'local', name: 'Family', color: '#2bff66' }],
  weather: { provider: 'auto', screens: {}, speed: 1, scanLines: false },
  house: { tiles: [] },
  power: { provider: 'none', warnAbove: 8 },   // 'comed' = ComEd Hourly Pricing panel + spike warnings (¢/kWh)
  defaultTab: 'family',  // 'family' | 'command' — the tab a display starts on (both tabs are always available)   // home-hub tiles: [{ entity, label, kind? }] — the hub URL/token live server-side, never here
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
  try { file = (await import(`../../config.js?_=${Math.floor(Date.now() / 60000)}`)).default || {}; source = 'config.js'; }
  catch (e) { console.warn('config.js not loaded (run the ⚙ setup wizard):', e.message); }
  let local = {};
  try { local = JSON.parse(localStorage.getItem(LS_KEY) || 'null') || {}; } catch { /* ignore */ }
  // The browser copy exists for installs with nowhere to save: the wizard writes it when the server
  // refused. It must never outrank a newer server copy — a stale one once put a wall display back on
  // the in-browser Google flow for a month while the server sat connected and unused. Last writer
  // wins (both sides stamp savedAt), a tie goes to the server, and a losing copy is removed so a
  // later wizard save cannot merge it back in.
  let overlay = {}; let dropped = false;
  if (Object.keys(local).length) {
    const fileAt = Date.parse(file.savedAt) || 0; const localAt = Date.parse(local.savedAt) || 0;
    if (source === 'defaults' || localAt > fileAt) { overlay = local; source += '+localStorage'; }
    else { dropped = true; try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ } }
  }
  const cfg = deepMerge(DEFAULTS, file, overlay);
  cfg.__source = source;
  cfg.__hasFile = source.startsWith('config.js');
  cfg.__droppedOverlay = dropped;
  return cfg;
}

export const isConfigured = (cfg) => !!(cfg.firebase?.apiKey || cfg.googleClientId || (cfg.location?.lat != null));
