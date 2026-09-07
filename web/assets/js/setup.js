// ⚙ Setup wizard: family → kids → location → Firebase → Google → save.
// Saves server-side when possible (save-config.php on a hosted install, or tools/serve.py locally),
// otherwise falls back to a localStorage override + a config.js download.
import { deepMerge, DEFAULTS, LS_KEY } from './config-loader.js';
import { testFirebase, testSync } from './store.js';
import { lookupPoint } from './wx.js';
import { loadScript } from './gcal.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `kid-${Date.now()}`;
const STEPS = ['Family', 'Kids', 'Location', 'Data', 'Google', 'Save'];
const KID_COLORS = ['#ff69b4', '#4169e1', '#2bff66', '#ffd11a', '#ff9f5b', '#c98bdb', '#2bd0ff', '#ff3b2e'];

export function openSetup(current, { firstRun = false } = {}) {
  if (document.getElementById('setup-overlay')) return;
  const draft = deepMerge(DEFAULTS, current); delete draft.__source; delete draft.__hasFile;
  let step = 0;

  const overlay = el('div', 'overlay'); overlay.id = 'setup-overlay';
  const dlg = el('div', 'dlg setup');
  const tbar = el('div', 'tbar'); const h3 = el('h3', null, 'Setup'); const grow = el('span', 'grow');
  const close = el('button', 'x', '×'); close.type = 'button'; close.title = 'Close';
  tbar.append(h3, grow, close); dlg.appendChild(tbar);
  const tabs = el('div', 'steps'); dlg.appendChild(tabs);
  const body = el('div', 'form'); dlg.appendChild(body);
  const nav = el('div', 'actions');
  const back = el('button', 'btn', '◀ Back'); back.type = 'button';
  const next = el('button', 'btn on', 'Next ▶'); next.type = 'button';
  const status = el('span', 'note left'); nav.append(status, back, next); dlg.appendChild(nav);
  overlay.appendChild(dlg); document.getElementById('canvas').appendChild(overlay);

  const destroy = () => overlay.remove();
  close.addEventListener('click', destroy);
  overlay.addEventListener('click', (e) => { if (e.target === overlay && !firstRun) destroy(); });

  const field = (label, input, hint) => { const l = el('label'); l.appendChild(el('span', null, label)); l.appendChild(input); if (hint) l.appendChild(el('small', 'hint', hint)); return l; };
  const text = (value, placeholder, onInput) => { const i = el('input'); i.type = 'text'; i.value = value ?? ''; i.placeholder = placeholder || ''; i.autocomplete = 'off'; i.addEventListener('input', () => onInput(i.value)); return i; };
  const note = (msg, kind) => { status.textContent = msg || ''; status.className = `note left ${kind || ''}`; };
  const testBtn = (label, fn) => { const b = el('button', 'btn sm', label); b.type = 'button'; const out = el('span', 'test-out');
    b.addEventListener('click', async () => { b.disabled = true; out.textContent = 'testing…'; out.className = 'test-out';
      try { out.textContent = '✓ ' + await fn(); out.className = 'test-out ok'; } catch (e) { out.textContent = '✗ ' + (e.message || e); out.className = 'test-out bad'; }
      b.disabled = false; });
    const row = el('div', 'test-row'); row.append(b, out); return row; };

  const render = () => {
    tabs.innerHTML = ''; STEPS.forEach((s, i) => { const t = el('button', 'step' + (i === step ? ' on' : '') + (i < step ? ' done' : ''), `${i + 1} ${s}`); t.type = 'button'; t.addEventListener('click', () => { step = i; render(); }); tabs.appendChild(t); });
    body.innerHTML = ''; note('');
    back.disabled = step === 0; next.textContent = step === STEPS.length - 1 ? 'Save' : 'Next ▶';
    const f = draft.family;
    if (step === 0) {
      body.appendChild(el('p', 'lead', firstRun ? 'Welcome! A few questions and the wall display is yours. Nothing here leaves your own setup.' : 'Names shown in the header and the status bar.'));
      body.appendChild(field('Family title', text(f.title, 'OUR FAMILY', (v) => { f.title = v; })));
      body.appendChild(field('Subtitle', text(f.subtitle, 'CENTRAL COMMAND', (v) => { f.subtitle = v; })));
      body.appendChild(field('Status bar text', text((f.footer || []).join(' • '), 'FAMILY COMMAND CENTER • EST. 2025 • YOUR TOWN, ST', (v) => { f.footer = v.split('•').map((s) => s.trim()).filter(Boolean); }), 'separate items with •'));
    } else if (step === 1) {
      body.appendChild(el('p', 'lead', 'One chore column per kid (3 chores each). Colours are theirs.'));
      const list = el('div', 'kid-list'); body.appendChild(list);
      const draw = () => { list.innerHTML = ''; (f.kids || []).forEach((k, i) => {
        const row = el('div', 'kid-row');
        const name = text(k.name, 'Name', (v) => { k.name = v; if (!k.locked) k.id = slug(v); });
        const color = el('input'); color.type = 'color'; color.value = k.color || KID_COLORS[i % KID_COLORS.length]; color.addEventListener('input', () => { k.color = color.value; });
        const rm = el('button', 'btn sm danger', '×'); rm.type = 'button'; rm.addEventListener('click', () => { f.kids.splice(i, 1); draw(); });
        row.append(name, color, rm); list.appendChild(row); }); };
      f.kids = (f.kids || []).map((k) => ({ ...k, locked: !!k.id }));
      draw();
      const add = el('button', 'btn sm', '+ Add kid'); add.type = 'button'; add.addEventListener('click', () => { f.kids.push({ id: '', name: '', color: KID_COLORS[f.kids.length % KID_COLORS.length] }); draw(); }); body.appendChild(add);
    } else if (step === 2) {
      const loc = draft.location;
      body.appendChild(el('p', 'lead', 'Drives the WeatherStar panel and the outside-temperature readout (US locations — National Weather Service).'));
      const q = text('', 'City, ST or ZIP', () => {}); const results = el('div', 'geo-results');
      const search = el('button', 'btn sm', 'Search'); search.type = 'button';
      const doSearch = async () => { results.innerHTML = ''; if (!q.value.trim()) return; results.appendChild(el('div', 'hint', 'searching…'));
        try { const u = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?SingleLine=${encodeURIComponent(q.value)}&category=City,Postal&countryCode=USA&maxLocations=6&outFields=City,Region,Postal&f=json`;
          const r = await (await fetch(u)).json(); results.innerHTML = '';
          (r.candidates || []).forEach((c) => { const b = el('button', 'btn sm geo', c.address); b.type = 'button'; b.addEventListener('click', () => { loc.lat = +c.location.y.toFixed(4); loc.lon = +c.location.x.toFixed(4); loc.label = c.attributes?.City ? `${c.attributes.City}, ${c.attributes.Region}` : c.address; labelI.value = loc.label; latI.value = loc.lat; lonI.value = loc.lon; results.innerHTML = ''; });
            results.appendChild(b); });
          if (!(r.candidates || []).length) results.appendChild(el('div', 'hint', 'no matches — enter lat/lon below'));
        } catch (e) { results.innerHTML = ''; results.appendChild(el('div', 'hint bad', `search failed: ${e.message}`)); } };
      search.addEventListener('click', doSearch); q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
      const srow = el('div', 'row-inline'); srow.append(q, search); body.appendChild(field('Find your town', srow)); body.appendChild(results);
      const labelI = text(loc.label, 'Shown on the WeatherStar panel', (v) => { loc.label = v; });
      const latI = text(loc.lat ?? '', '41.8781', (v) => { loc.lat = v === '' ? null : +v; }); const lonI = text(loc.lon ?? '', '-87.6298', (v) => { loc.lon = v === '' ? null : +v; });
      body.appendChild(field('Label', labelI)); const ll = el('div', 'row2'); ll.append(field('Latitude', latI), field('Longitude', lonI)); body.appendChild(ll);
      body.appendChild(testBtn('Test NWS', async () => { const p = await lookupPoint(loc.lat, loc.lon); return `${p.city}, ${p.state} — station ${p.station}`; }));
    } else if (step === 3) {
      const fb = draft.firebase;
      body.appendChild(el('p', 'lead', 'Where the shopping list, notes, meals, chores and the local calendar live.'));
      const choices = [['sync', 'Self-hosted (this server)', 'No cloud account. Phones and the wall share the store on this same server — works with the hosted PHP install and with tools/serve.py / Docker.'],
        ['firestore', 'Firebase Firestore', 'Google\'s cloud database. Real-time sync anywhere; needs a free Firebase project.'],
        ['local', 'This device only', 'Zero setup. Data stays in this browser; nothing syncs.']];
      const picker = el('div', 'kid-list'); body.appendChild(picker);
      const fbBox = el('div'); const syncBox = el('div');
      const paintChoice = () => { picker.innerHTML = ''; choices.forEach(([v, name, desc]) => { const row = el('div', 'panel-row'); const chk = el('button', 'chk' + (draft.backend === v ? ' on' : '')); chk.type = 'button';
        chk.addEventListener('click', () => { draft.backend = v; paintChoice(); fbBox.hidden = v !== 'firestore'; syncBox.hidden = v !== 'sync'; }); const t = el('div'); t.appendChild(el('div', 'pname', name)); t.appendChild(el('small', 'hint', desc)); row.append(chk, t); picker.appendChild(row); }); };
      if (!draft.backend) draft.backend = fb.apiKey ? 'firestore' : 'sync';
      paintChoice();
      // firebase details
      const ta = el('textarea'); ta.rows = 4; ta.placeholder = '{ "apiKey": "…", "authDomain": "…", "projectId": "…", … }';
      ta.addEventListener('input', () => { const parsed = parseFirebase(ta.value); if (parsed) { Object.assign(fb, parsed); paint(); note('parsed ✓', 'ok'); } else note(ta.value.trim() ? 'could not parse yet…' : ''); });
      fbBox.appendChild(field('Paste Firebase web config', ta, 'Firebase console → Project settings → Your apps → Web app; the whole "const firebaseConfig = {…}" snippet or plain JSON both work'));
      const grid = el('div', 'kv'); fbBox.appendChild(grid);
      const paint = () => { grid.innerHTML = ''; ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'].forEach((k) => { grid.appendChild(el('span', 'k', k)); const i = text(fb[k], '', (v) => { fb[k] = v; }); grid.appendChild(i); }); };
      paint();
      fbBox.appendChild(testBtn('Test Firestore', () => testFirebase(fb)));
      fbBox.appendChild(el('small', 'hint', 'Firestore rules: the page login protects the page, not the database — restrict rules to what you are comfortable with.'));
      syncBox.appendChild(testBtn('Test sync store', () => testSync()));
      syncBox.appendChild(el('small', 'hint', 'Hosted install: the web server must be able to write includes/data/. Local install: data/planner.json next to the repo (a Docker volume in the image).'));
      fbBox.hidden = draft.backend !== 'firestore'; syncBox.hidden = draft.backend !== 'sync';
      body.append(fbBox, syncBox);
    } else if (step === 4) {
      body.appendChild(el('p', 'lead', 'Google Calendar: in Google Cloud Console enable the Calendar API, create an OAuth 2.0 Web client, and add this site\'s origin to Authorized JavaScript origins.'));
      body.appendChild(field('OAuth client ID', text(draft.googleClientId, '1234567890-abc.apps.googleusercontent.com', (v) => { draft.googleClientId = v.trim(); })));
      body.appendChild(field('Holiday calendar', text(draft.holidayCalendarId, DEFAULTS.holidayCalendarId, (v) => { draft.holidayCalendarId = v.trim(); }), 'any public Google calendar id; blank for none'));
      body.appendChild(el('small', 'hint', `This page's origin: ${location.origin}${location.origin.startsWith('http://') && !/localhost|127\.0\.0\.1/.test(location.origin) ? ' — Google only accepts http://localhost or https:// origins, so sign-in will not work from here.' : ''}`));
      body.appendChild(testBtn('Check client ID', async () => { if (!/\.apps\.googleusercontent\.com$/.test(draft.googleClientId)) throw new Error('does not look like a Google OAuth client ID'); await loadScript('https://accounts.google.com/gsi/client'); return 'Google Identity loaded — sign in from the calendar panel after saving'; }));
    } else if (step === 5) {
      body.appendChild(el('p', 'lead', 'Review and save. The page reloads with the new settings.'));
      const pre = el('pre', 'preview', JSON.stringify(exportable(), null, 2)); body.appendChild(pre);
      body.appendChild(el('small', 'hint', 'Saved to config.js on the server when this install can write it (hosted with PHP, or tools/serve.py). Otherwise it is kept in this browser and you can download config.js to place next to app.html.'));
      const dl = el('button', 'btn sm', 'Download config.js'); dl.type = 'button'; dl.addEventListener('click', () => { const blob = new Blob([configSource()], { type: 'text/javascript' }); const a = el('a'); a.href = URL.createObjectURL(blob); a.download = 'config.js'; a.click(); }); body.appendChild(dl);
    }
  };
  const exportable = () => { const c = structuredClone(draft); c.family.kids = (c.family.kids || []).filter((k) => k.name).map(({ id, name, color }) => ({ id: id || slug(name), name, color })); return c; };
  const configSource = () => `// Free Family Planner — site config (written by the ⚙ setup wizard)\nexport default ${JSON.stringify(exportable(), null, 2)};\n`;

  back.addEventListener('click', () => { step = Math.max(0, step - 1); render(); });
  next.addEventListener('click', async () => {
    if (step < STEPS.length - 1) { step += 1; render(); return; }
    next.disabled = true; note('saving…');
    const cfg = exportable();
    try {
      const r = await fetch('save-config.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cfg) });
      if (r.ok) { localStorage.removeItem(LS_KEY); note('saved to config.js — reloading', 'ok'); setTimeout(() => location.reload(), 600); return; }
      throw new Error(`server said ${r.status}`);
    } catch (e) {
      console.warn('server save unavailable:', e.message);
      localStorage.setItem(LS_KEY, JSON.stringify(cfg));
      note('kept in this browser (no server-side save here) — reloading', 'warn'); setTimeout(() => location.reload(), 1200);
    }
  });
  render();
}

/* Accepts JSON or the JS snippet Firebase shows ("const firebaseConfig = { apiKey: "…", … };"). */
export function parseFirebase(src) {
  const m = src.match(/\{[\s\S]*\}/); if (!m) return null;
  let body = m[0];
  try { return pick(JSON.parse(body)); } catch { /* try JS-ish */ }
  const out = {}; const re = /([A-Za-z]+)\s*:\s*["']([^"']*)["']/g; let x;
  while ((x = re.exec(body))) out[x[1]] = x[2];
  return out.apiKey && out.projectId ? pick(out) : null;
}
const pick = (o) => Object.fromEntries(['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'].map((k) => [k, o[k] || '']));
