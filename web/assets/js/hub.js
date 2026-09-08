// Home hub client: talks only to our own server (api/hub.php), which holds the hub token.
// - House panel: configurable tiles (config.house.tiles) polled every 15 s
// - Shopping-list sync: two-way with the hub's to-do list, run from one screen
import * as store from './store.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const norm = (s) => (s || '').trim().toLowerCase();
async function api(op, params = {}, body) {
  const q = new URLSearchParams({ op, ...params }).toString();
  const r = await fetch(`api/hub.php?${q}`, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `hub ${r.status}`);
  return j;
}
export const hub = {
  status: () => api('get'), save: (cfg) => api('save', {}, cfg), test: () => api('test'), entities: () => api('entities').then((r) => r.entities),
  states: (ids) => api('states', { ids: ids.join(',') }).then((r) => r.states),
  todo: () => api('todo').then((r) => r.items), todoAdd: (text) => api('todo-add', {}, { text }), todoSet: (uid, completed) => api('todo-set', {}, { uid, completed }), todoRemove: (uid) => api('todo-remove', {}, { uid }),
};

/* ---------- tiles ---------- */
export function tileKind(ent) {
  const d = ent.domain || (ent.id || '').split('.')[0]; const dc = ent.deviceClass || '';
  if (d === 'climate') return 'climate';
  if (d === 'person' || d === 'device_tracker') return 'presence';
  if (d === 'lock') return 'lock';
  if (d === 'binary_sensor') return /door|garage|window|opening/.test(dc) ? 'door' : /motion|occupancy|presence/.test(dc) ? 'motion' : 'onoff';
  if (d === 'switch' || d === 'light' || d === 'input_boolean') return 'onoff';
  if (d === 'cover') return 'cover';
  if (d === 'weather') return 'weather';
  return 'value';
}
const WX_WORDS = { partlycloudy: 'partly cloudy', 'clear-night': 'clear night', 'lightning-rainy': 'thunderstorms', 'snowy-rainy': 'snow and rain', pouring: 'heavy rain', rainy: 'rain', snowy: 'snow', sunny: 'sunny', cloudy: 'cloudy', fog: 'fog', hail: 'hail', windy: 'windy', 'windy-variant': 'windy', exceptional: 'severe' };
const fmt = (n) => (n == null || n === '' ? '—' : (Number.isFinite(+n) ? String(Math.round(+n * 10) / 10) : String(n)));
function tileFace(kind, s) {
  const st = s?.state ?? 'unknown'; const a = s?.attrs || {};
  switch (kind) {
    case 'climate': return { big: `${fmt(a.current_temperature)}°`, small: a.temperature != null ? `set ${fmt(a.temperature)}° · ${a.hvac_action || st}` : (a.hvac_action || st), on: /heat|cool/.test(a.hvac_action || '') };
    case 'presence': return { big: st === 'home' ? 'HOME' : st === 'not_home' ? 'AWAY' : String(st).toUpperCase(), small: '', on: st === 'home' };
    case 'lock': return { big: st === 'locked' ? 'LOCKED' : String(st).toUpperCase(), small: '', on: st === 'locked', warn: st !== 'locked' };
    case 'door': return { big: st === 'on' ? 'OPEN' : st === 'off' ? 'CLOSED' : String(st).toUpperCase(), small: '', on: st === 'off', warn: st === 'on' };
    case 'motion': return { big: st === 'on' ? 'MOTION' : 'CLEAR', small: '', on: st === 'on' };
    case 'onoff': return { big: st === 'on' ? 'ON' : st === 'off' ? 'OFF' : String(st).toUpperCase(), small: a.brightness != null ? `${Math.round(a.brightness / 2.55)}%` : '', on: st === 'on' };
    case 'cover': return { big: String(st).toUpperCase(), small: '', on: st === 'closed' };
    case 'weather': return { big: a.temperature != null ? `${fmt(a.temperature)}°` : String(st), small: WX_WORDS[st] || String(st).replace(/-/g, ' '), on: true };
    default: return { big: `${fmt(st)}${s?.unit ? ` ${s.unit}` : ''}`, small: '', on: st !== 'unavailable' && st !== 'unknown' };
  }
}
export function mountHouse(host, tiles, onStatus) {
  host.innerHTML = '';
  if (!tiles.length) { host.appendChild(el('div', 'empty', 'Pick tiles in ⚙ Setup → Home hub.')); return () => {}; }
  const nodes = tiles.map((t) => { const n = el('div', 'tile'); n.dataset.entity = t.entity; n.appendChild(el('div', 'tl', t.label || t.entity)); n.appendChild(el('div', 'tb', '—')); n.appendChild(el('div', 'ts', '')); host.appendChild(n); return n; });
  let timer;
  const refresh = async () => {
    try {
      const states = await hub.states(tiles.map((t) => t.entity));
      tiles.forEach((t, i) => { const s = states[t.entity]; const kind = t.kind || tileKind({ id: t.entity, deviceClass: s?.deviceClass }); const f = tileFace(kind, s);
        nodes[i].querySelector('.tb').textContent = f.big; nodes[i].querySelector('.ts').textContent = f.small; nodes[i].className = `tile ${kind}${f.on ? ' on' : ''}${f.warn ? ' warn' : ''}${s ? '' : ' offline'}`; });
      onStatus?.('on');
    } catch (e) { console.warn('hub tiles:', e.message); onStatus?.('warn'); nodes.forEach((n) => n.classList.add('offline')); }
  };
  refresh(); timer = setInterval(refresh, 15000);
  return () => clearInterval(timer);
}

/* ---------- shopping-list sync (run from one screen) ---------- */
const MAP_KEY = 'fp.hubTodoMap';
export function startTodoSync(getLocalItems, onStatus) {
  let map = {}; try { map = JSON.parse(localStorage.getItem(MAP_KEY) || '{}'); } catch { /* ignore */ }
  let busy = false;
  const save = () => localStorage.setItem(MAP_KEY, JSON.stringify(map));
  const sync = async () => {
    if (busy) return; busy = true;
    try {
      const remote = await hub.todo(); const local = getLocalItems();
      const byUid = Object.fromEntries(remote.map((r) => [r.uid, r])); const byId = Object.fromEntries(local.map((l) => [l.id, l]));
      const pairedUids = new Set(Object.values(map).map((m) => m.uid)); const pairedIds = new Set(Object.keys(map));
      // 1. existing pairs: deletions + completion changes
      for (const [id, m] of Object.entries(map)) {
        const l = byId[id]; const r = byUid[m.uid];
        if (!l && r) { await hub.todoRemove(m.uid); delete map[id]; continue; }
        if (l && !r) { await store.deleteListItem('shopping', id); delete map[id]; continue; }
        if (!l && !r) { delete map[id]; continue; }
        const lc = !!l.completed; const rc = !!r.completed; const last = !!m.completed;
        if (lc !== rc) { if (rc !== last) { await store.toggleListItem('shopping', id, lc); m.completed = rc; } else { await hub.todoSet(m.uid, lc); m.completed = lc; } }
        else m.completed = lc;
      }
      // 2. unpaired local items → pair by text or push to hub
      for (const l of local) { if (pairedIds.has(l.id)) continue;
        const r = remote.find((x) => !pairedUids.has(x.uid) && norm(x.text) === norm(l.text));
        if (r) { map[l.id] = { uid: r.uid, completed: !!l.completed }; pairedUids.add(r.uid); if (!!r.completed !== !!l.completed) await hub.todoSet(r.uid, !!l.completed); }
        else if (!l.completed) await hub.todoAdd(l.text);   // completed-but-unsynced items stay local
      }
      // 3. unpaired hub items → add locally (paired next round by text)
      for (const r of remote) { if (pairedUids.has(r.uid)) continue;
        if (local.some((l) => norm(l.text) === norm(r.text))) continue;
        if (!r.completed) await store.addListItem('shopping', r.text);
      }
      save(); onStatus?.('on');
    } catch (e) { console.warn('todo sync:', e.message); onStatus?.('warn'); }
    finally { busy = false; }
  };
  sync(); const t = setInterval(sync, 20000);
  return { sync, stop: () => clearInterval(t) };
}
