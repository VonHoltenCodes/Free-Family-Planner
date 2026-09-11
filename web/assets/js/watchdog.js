// Kiosk health. A wall display runs the same page for weeks, so things that never matter in a
// browser tab (a dead timer, a leaking iframe, an exception nobody sees) show up as "it froze".
//
//  - heartbeats: subsystems check in; if one stops checking in, we know which
//  - errors: window errors and unhandled promise rejections are captured and published
//  - recycle: the bundled WeatherStar app is reloaded every few hours (it is a whole app of its own)
//  - reload: a quiet-hour reload every night, and an emergency reload if the page looks wedged
// Everything it learns rides along in the state snapshot, so a freeze can be diagnosed from the server.
const beats = {};           // name -> {at, every}
const errors = [];          // last few, newest first
const started = Date.now();
let reloads = 0;
try { reloads = +(sessionStorage.getItem('fp.reloads') || 0); } catch { /* ignore */ }

export function beat(name, everyMs) { beats[name] = { at: Date.now(), every: everyMs }; }
export function noteError(kind, message, extra) {
  errors.unshift({ kind, message: String(message).slice(0, 300), at: new Date().toISOString(), ...extra });
  errors.length = Math.min(errors.length, 8);
}
export function health() {
  const now = Date.now();
  const why = (() => { try { return sessionStorage.getItem('fp.reloadWhy'); } catch { return null; } })();
  const late = Object.entries(beats).filter(([, b]) => now - b.at > b.every * 4 + 60_000).map(([k]) => k);
  return {
    uptimeMin: Math.round((now - started) / 60000), reloads, lastReload: why,
    beats: Object.fromEntries(Object.entries(beats).map(([k, b]) => [k, Math.round((now - b.at) / 1000)])),
    late, errors: errors.slice(0, 4),
    memMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  };
}

let reloading = false;
function recentReloads() {
  try { return JSON.parse(sessionStorage.getItem('fp.reloadLog') || '[]').filter((t) => Date.now() - t < 30 * 60_000); } catch { return []; }
}
function reload(why) {
  if (reloading) return;
  const recent = recentReloads();
  if (recent.length >= 3) {   // a reload loop is worse than a freeze: stop, keep the evidence, let the nightly one try later
    noteError('watchdog', `suppressed reload (${why}) — ${recent.length} reloads in the last 30 min`);
    return;
  }
  reloading = true;
  try {
    sessionStorage.setItem('fp.reloads', String(reloads + 1));
    sessionStorage.setItem('fp.reloadWhy', `${why} @ ${new Date().toISOString()}`);
    sessionStorage.setItem('fp.reloadLog', JSON.stringify([...recent, Date.now()]));
  } catch { /* ignore */ }
  console.warn('watchdog reload:', why);
  location.reload();
}

export function startWatchdog({ frame, nightlyHour = 4, recycleHours = 6, onStatus } = {}) {
  window.addEventListener('error', (e) => noteError('error', e.message, { at_: `${(e.filename || '').split('/').pop()}:${e.lineno}` }));
  window.addEventListener('unhandledrejection', (e) => noteError('rejection', e.reason?.message || e.reason));

  // 1. the clock is the canary: it beats every second, so if the page's timers die we see it fast.
  //    A display that went to sleep also stops beating — tell the two apart by whether THIS timer
  //    ran on schedule. If it was suspended too, the device was asleep: forgive everything and move on.
  const EVERY = 30_000; let lastCheck = Date.now();
  setInterval(() => {
    const now = Date.now(); const drift = now - lastCheck - EVERY; lastCheck = now;
    if (drift > 20_000) {                       // we were suspended as well → device asleep / tab backgrounded
      noteError('drift', `timers paused ${Math.round(drift / 1000)}s (device asleep?)`);
      Object.values(beats).forEach((b) => { b.at = now; });   // don't punish subsystems for the nap
      onStatus?.('on'); return;
    }
    const h = health();
    if (!h.late.length) { onStatus?.('on'); return; }
    onStatus?.('warn', `stale: ${h.late.join(', ')}`);
    // only the clock going quiet means the page itself is wedged; a stale feed is just a stale feed
    if (h.late.includes('clock') && now - started > 120_000) reload(`clock stalled (${h.late.join(',')})`);
  }, EVERY);

  // 2. recycle the WeatherStar iframe: it is a separate long-running app, the usual memory hog
  if (frame && recycleHours > 0) {
    setInterval(() => {
      const src = frame.getAttribute('src'); if (!src) return;
      frame.src = src.replace(/([?&])_r=\d+/, '$1') + (src.includes('?') ? '&' : '?') + `_r=${Date.now()}`;
      noteError('info', 'WeatherStar recycled');
    }, recycleHours * 3600_000);
  }

  // 3. nightly reload in a quiet hour — the cheap cure for anything that creeps up over days
  setInterval(() => {
    const d = new Date();
    if (d.getHours() === nightlyHour && d.getMinutes() < 5 && Date.now() - started > 3600_000) reload('nightly');
  }, 4 * 60_000);

  // 4. if the page was restored from the back/forward cache after a long sleep, start clean
  window.addEventListener('pageshow', (e) => { if (e.persisted) reload('restored from bfcache'); });
  return { health, beat, noteError };
}
