// Kiosk health. A wall display runs the same page for weeks, so things that never matter in a
// browser tab (a dead timer, a leaking iframe, an exception nobody sees) show up as "it froze".
//
//  - heartbeats: subsystems check in; if one stops checking in, we know which
//  - errors: window errors and unhandled promise rejections are captured and published
//  - recycle: the bundled WeatherStar app is reloaded every few hours (it is a whole app of its own)
//  - reload: a quiet-hour reload every night, and an emergency reload if the page looks wedged
// Everything it learns rides along in the state snapshot, so a freeze can be diagnosed from the server.
const beats = {};           // name -> {at, every}
const STALE_RELOAD_MS = 2 * 3600_000;   // a feed silent this long: reload rather than sit there stale
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
    late, errors: errors.slice(0, 4), wakeLock: ('wakeLock' in navigator),
    memMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
  };
}

let reloading = 0;      // timestamp of the attempt in flight, not a permanent latch
let suppressedAt = 0;
function recentReloads() {
  try { return JSON.parse(sessionStorage.getItem('fp.reloadLog') || '[]').filter((t) => Date.now() - t < 30 * 60_000); } catch { return []; }
}
/* A wall display once ignored location.reload() outright and sat there for a day, so this escalates
   and checks whether it actually went anywhere. If we are still running seconds later, try harder. */
function reload(why) {
  if (reloading && Date.now() - reloading < 90_000) return;   // an attempt is in flight
  const recent = recentReloads();
  if (recent.length >= 3) {
    if (Date.now() - suppressedAt > 10 * 60_000) {   // say it once, not every half minute
      suppressedAt = Date.now();
      noteError('watchdog', `giving up on reloading (${why}) — 3 attempts in the last 30 min did not fix it`);
    }
    return;
  }
  reloading = Date.now();
  try {
    sessionStorage.setItem('fp.reloads', String(reloads + 1));
    sessionStorage.setItem('fp.reloadWhy', `${why} @ ${new Date().toISOString()}`);
    sessionStorage.setItem('fp.reloadLog', JSON.stringify([...recent, Date.now()]));
  } catch { /* ignore */ }
  console.warn('watchdog reload:', why);
  const url = location.href.split('#')[0];
  const attempts = [
    () => location.reload(),
    () => location.replace(url),
    () => { location.href = url + (url.includes('?') ? '&' : '?') + `_r=${Date.now()}`; },
    () => window.open(url, '_self'),
  ];
  attempts.forEach((go, i) => setTimeout(() => { try { go(); } catch (e) { noteError('watchdog', `reload step ${i} threw: ${e.message}`); } }, i * 5000));
  setTimeout(() => { reloading = 0; noteError('watchdog', `reload did not take effect (${why}) — still running`); }, 90_000);
}

export function startWatchdog({ frame, nightlyHour = 4, recycleHours = 6, onStatus, onResume } = {}) {
  window.addEventListener('error', (e) => noteError('error', e.message, { at_: `${(e.filename || '').split('/').pop()}:${e.lineno}` }));
  window.addEventListener('unhandledrejection', (e) => noteError('rejection', e.reason?.message || e.reason));

  // 1. the clock is the canary: it beats every second, so if the page's timers die we see it fast.
  //    A display that went to sleep also stops beating — tell the two apart by whether THIS timer
  //    ran on schedule. If it was suspended too, the device was asleep: forgive, and catch up.
  const EVERY = 30_000; let lastCheck = Date.now();
  setInterval(() => {
    const now = Date.now(); const drift = now - lastCheck - EVERY; lastCheck = now;
    if (drift > 20_000) {                       // we were suspended as well → device asleep / tab backgrounded
      noteError('drift', `timers paused ${Math.round(drift / 1000)}s (device asleep?)`);
      Object.values(beats).forEach((b) => { b.at = now; });
      onResume?.(Math.round(drift / 1000));     // pull everything fresh rather than waiting out the intervals
      onStatus?.('on'); return;
    }
    const h = health();
    if (!h.late.length) { onStatus?.('on'); return; }
    onStatus?.('warn', `stale: ${h.late.join(', ')}`);
    if (now - started < 120_000) return;
    // the clock going quiet means the page itself is wedged
    if (h.late.includes('clock')) return reload(`clock stalled (${h.late.join(',')})`);
    // a feed that has been dead for hours is the "it froze" everyone actually sees: a reload fixes it
    const deadFor = (name) => (beats[name] ? now - beats[name].at : 0);
    const dead = Object.keys(beats).filter((k) => deadFor(k) > STALE_RELOAD_MS);
    if (dead.length) reload(`feeds dead for hours: ${dead.join(',')}`);
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

  // 4. hold a wake lock where the browser offers one — a sleeping tablet stops fetching and the
  //    display looks frozen when you walk past it
  let lock = null;
  const takeLock = async () => {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); }
    catch (e) { noteError('wakelock', e.message); }
  };
  takeLock();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (!lock) takeLock(); onResume?.(0); } });
  setInterval(() => { if (!lock) takeLock(); }, 5 * 60_000);

  // 5. if the page was restored from the back/forward cache after a long sleep, start clean
  window.addEventListener('pageshow', (e) => { if (e.persisted) reload('restored from bfcache'); });
  return { health, beat, noteError };
}
