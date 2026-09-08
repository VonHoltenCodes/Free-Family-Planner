// ⚙ Setup wizard: family → kids → location → Firebase → Google → save.
// Saves server-side when possible (save-config.php on a hosted install, or tools/serve.py locally),
// otherwise falls back to a localStorage override + a config.js download.
import { deepMerge, DEFAULTS, LS_KEY } from './config-loader.js';
import { testFirebase, testSync } from './store.js';
import { lookupPoint, WS_SCREENS } from './wx.js';
import { openMeteoConditions } from './wx-card.js';
import { hub, tileKind, controllable } from './hub.js';
import { loadScript } from './gcal.js';

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `kid-${Date.now()}`;
const STEPS = ['Family', 'Kids', 'Location', 'Data', 'Calendars', 'Weather', 'Home hub', 'Save'];
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

  const opt2 = (label, options, value, set) => { const wrap = el('div', 'opt'); wrap.appendChild(el('span', 'k', label)); const grp = el('div', 'seg');
    options.forEach(([v, name]) => { const b = el('button', 'btn sm' + (v === value ? ' on' : ''), name); b.type = 'button'; b.addEventListener('click', () => { set(v); grp.querySelectorAll('.btn').forEach((q) => q.classList.remove('on')); b.classList.add('on'); }); grp.appendChild(b); });
    wrap.appendChild(grp); return wrap; };

  const render = () => {
    tabs.innerHTML = ''; STEPS.forEach((s, i) => { const t = el('button', 'step' + (i === step ? ' on' : '') + (i < step ? ' done' : ''), `${i + 1} ${s}`); t.type = 'button'; t.addEventListener('click', () => { step = i; render(); }); tabs.appendChild(t); });
    body.innerHTML = ''; note('');
    back.disabled = step === 0; next.textContent = step === STEPS.length - 1 ? 'Save' : 'Next ▶';
    const f = draft.family;
    if (step === 0) {
      body.appendChild(el('p', 'lead', firstRun ? 'Welcome! A few questions and the wall display is yours. Nothing here leaves your own setup. Not a family planner person? Skip kids and meals, hide any panel later in ☰ Display, and use it as a home dashboard.' : 'Names shown in the header and the status bar.'));
      body.appendChild(opt2('Start as', [['family', 'Family planner'], ['command', 'Home central command'], ['both', 'Both (tabs)']], draft.defaultMode || 'both', (v) => { draft.defaultMode = v; }));
      body.appendChild(el('small', 'hint', 'Family planner = calendar, lists, meals, chores, weather. Home central command = house controls from your hub, weather, calendar. Both = a FAMILY / COMMAND tab switch in the header. Every display can override this in ☰ Display.'));
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
      body.appendChild(el('p', 'lead', 'Drives the weather panel and the outside-temperature readout. US locations get the WeatherStar 4000+ (National Weather Service); anywhere else gets a conditions card (Open-Meteo).'));
      const usOnly = el('button', 'chk on'); usOnly.type = 'button'; let us = true; usOnly.addEventListener('click', () => { us = !us; usOnly.classList.toggle('on', us); });
      const usRow = el('div', 'panel-row'); usRow.append(usOnly, el('span', 'pname', 'Search US places only (turn off for the rest of the world)')); body.appendChild(usRow);
      const q = text('', 'City, ST or ZIP', () => {}); const results = el('div', 'geo-results');
      const search = el('button', 'btn sm', 'Search'); search.type = 'button';
      const doSearch = async () => { results.innerHTML = ''; if (!q.value.trim()) return; results.appendChild(el('div', 'hint', 'searching…'));
        try { const u = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?SingleLine=${encodeURIComponent(q.value)}&category=City,Postal${us ? '&countryCode=USA' : ''}&maxLocations=6&outFields=City,Region,Country&f=json`;
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
      body.appendChild(testBtn('Test weather', async () => { try { const p = await lookupPoint(loc.lat, loc.lon); return `NWS: ${p.city}, ${p.state} — station ${p.station} → WeatherStar 4000+`; } catch (e) { const c = await openMeteoConditions(loc, 'us'); return `outside NWS coverage → Open-Meteo card (${c.temp}°F, ${c.cond})`; } }));
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
      if (!Array.isArray(draft.calendars) || !draft.calendars.length) draft.calendars = [{ type: 'local', name: 'Family', color: '#2bff66' }];
      body.appendChild(el('p', 'lead', 'Calendars are shown together on the grid. Mix and match: a local family calendar, any iCal/ICS feeds, and Google Calendar.'));
      // local family calendar
      const loc = draft.calendars.find((c) => c.type === 'local');
      const locRow = el('div', 'panel-row'); const lchk = el('button', 'chk' + (loc ? ' on' : '')); lchk.type = 'button';
      const lname = text(loc?.name || 'Family', 'Family', (v) => { const c = draft.calendars.find((x) => x.type === 'local'); if (c) c.name = v; });
      const lcol = el('input'); lcol.type = 'color'; lcol.value = loc?.color || '#2bff66'; lcol.addEventListener('input', () => { const c = draft.calendars.find((x) => x.type === 'local'); if (c) c.color = lcol.value; });
      lchk.addEventListener('click', () => { const i = draft.calendars.findIndex((x) => x.type === 'local'); if (i >= 0) draft.calendars.splice(i, 1); else draft.calendars.unshift({ type: 'local', name: lname.value || 'Family', color: lcol.value }); lchk.classList.toggle('on', i < 0); });
      locRow.append(lchk, el('span', 'pname', 'Local family calendar (stored in your data backend, editable on the wall)'), lname, lcol); body.appendChild(locRow);
      // ICS feeds
      body.appendChild(el('div', 'sect', 'iCal / ICS feeds (read-only)'));
      const feeds = el('div', 'kid-list'); body.appendChild(feeds);
      const drawFeeds = () => { feeds.innerHTML = ''; draft.calendars.forEach((c, i) => { if (c.type !== 'ics') return; const row = el('div', 'kid-row');
        row.append(text(c.name, 'Name (School, Soccer…)', (v) => { c.name = v; }), text(c.url, 'https://…/calendar.ics', (v) => { c.url = v.trim(); }));
        const col = el('input'); col.type = 'color'; col.value = c.color || '#c98bdb'; col.addEventListener('input', () => { c.color = col.value; });
        const rm = el('button', 'btn sm danger', '×'); rm.type = 'button'; rm.addEventListener('click', () => { draft.calendars.splice(i, 1); drawFeeds(); });
        row.append(col, rm); feeds.appendChild(row); }); };
      drawFeeds();
      const addF = el('button', 'btn sm', '+ Add feed'); addF.type = 'button'; addF.addEventListener('click', () => { draft.calendars.push({ type: 'ics', name: '', url: '', color: KID_COLORS[(draft.calendars.length + 3) % KID_COLORS.length] }); drawFeeds(); }); body.appendChild(addF);
      body.appendChild(el('small', 'hint', 'Where to find feed URLs: iCloud → Calendar → share → Public Calendar (webcal:// → use https://); Google → calendar settings → "Secret address in iCal format"; Outlook → Shared calendars → Publish; most school and sports sites have an "iCal" or "subscribe" link. Feeds are fetched through this server after you save (browsers cannot fetch them directly).'));
      body.appendChild(testBtn('Test feeds', async () => { const f = draft.calendars.filter((c) => c.type === 'ics' && c.url); if (!f.length) throw new Error('no feeds added'); const res = [];
        for (const c of f) { try { const r = await fetch(`api/ics.php?url=${encodeURIComponent(c.url)}`, { cache: 'no-store' }); if (r.status === 403) { res.push(`${c.name || c.url}: save first, then test`); continue; } if (!r.ok) throw new Error(`HTTP ${r.status}`); const t = await r.text(); if (!/BEGIN:VCALENDAR/i.test(t)) throw new Error('not an ICS file'); res.push(`${c.name || c.url}: ok, ${(t.match(/BEGIN:VEVENT/g) || []).length} events`); } catch (e) { res.push(`${c.name || c.url}: ${e.message}`); } }
        return res.join(' · '); }));
      // home assistant calendars (if a hub is connected)
      const haSect = el('div'); haSect.hidden = true; body.appendChild(haSect);
      haSect.appendChild(el('div', 'sect', 'Home Assistant calendars (read-only)'));
      const haList = el('div', 'kid-list'); haSect.appendChild(haList);
      hub.status().then((s) => { if (s.type !== 'homeassistant') return; return hub.calendars().then((cals) => { if (!cals.length) return; haSect.hidden = false;
        cals.forEach((hc, i) => { const row = el('div', 'panel-row'); const cur = () => draft.calendars.find((x) => x.type === 'ha' && x.entity === hc.id);
          const chk = el('button', 'chk' + (cur() ? ' on' : '')); chk.type = 'button'; chk.setAttribute('role', 'switch');
          const col = el('input'); col.type = 'color'; col.value = cur()?.color || KID_COLORS[(i + 2) % KID_COLORS.length]; col.addEventListener('input', () => { const c = cur(); if (c) c.color = col.value; });
          chk.addEventListener('click', () => { const c = cur(); if (c) draft.calendars.splice(draft.calendars.indexOf(c), 1); else draft.calendars.push({ type: 'ha', entity: hc.id, name: hc.name, color: col.value }); chk.classList.toggle('on', !c); });
          row.append(chk, el('span', 'pname', hc.name), el('span', 'eid', hc.id), col); haList.appendChild(row); });
        haSect.appendChild(el('small', 'hint', 'Calendars your hub knows (Google, iCloud, CalDAV, local — whatever you connected in Home Assistant). Shown read-only; events are fetched through your server.')); }); }).catch(() => {});
      // google
      body.appendChild(el('div', 'sect', 'Google Calendar (read/write)'));
      body.appendChild(field('OAuth client ID', text(draft.googleClientId, '1234567890-abc.apps.googleusercontent.com', (v) => { draft.googleClientId = v.trim(); }), 'Google Cloud Console → enable the Calendar API → OAuth 2.0 Web client → add this site\'s origin to Authorized JavaScript origins. Leave blank to skip Google.'));
      body.appendChild(field('Holiday calendar', text(draft.holidayCalendarId, DEFAULTS.holidayCalendarId, (v) => { draft.holidayCalendarId = v.trim(); }), 'any public Google calendar id; blank for none'));
      body.appendChild(el('small', 'hint', `This page's origin: ${location.origin}${location.origin.startsWith('http://') && !/localhost|127\.0\.0\.1/.test(location.origin) ? ' — Google only accepts http://localhost or https:// origins, so sign-in will not work from here.' : ''}`));
      body.appendChild(testBtn('Check client ID', async () => { if (!/\.apps\.googleusercontent\.com$/.test(draft.googleClientId)) throw new Error('does not look like a Google OAuth client ID'); await loadScript('https://accounts.google.com/gsi/client'); return 'Google Identity loaded — sign in from the calendar panel after saving'; }));
    } else if (step === 5) {
      const wx = draft.weather = { provider: 'auto', screens: {}, speed: 1, scanLines: false, ...(draft.weather || {}) };
      body.appendChild(el('p', 'lead', 'The weather panel.'));
      body.appendChild(opt2('Provider', [['auto', 'Auto'], ['weatherstar', 'WeatherStar 4000+'], ['card', 'Conditions card']], wx.provider, (v) => { wx.provider = v; }));
      body.appendChild(el('small', 'hint', 'Auto = WeatherStar where the US National Weather Service has data, otherwise the Open-Meteo conditions card (works worldwide).'));
      body.appendChild(el('div', 'sect', 'WeatherStar screens in the rotation'));
      const grid = el('div', 'kv screens'); WS_SCREENS.forEach(([id, name, on]) => { const chk = el('button', 'chk' + ((wx.screens[id] ?? on) ? ' on' : '')); chk.type = 'button'; chk.addEventListener('click', () => { const cur = wx.screens[id] ?? on; wx.screens[id] = !cur; chk.classList.toggle('on', !cur); }); grid.append(chk, el('span', 'pname', name)); }); body.appendChild(grid);
      body.appendChild(opt2('Speed', [[0.5, 'Slow'], [0.75, '¾'], [1, 'Normal'], [1.5, 'Fast'], [2, 'Fastest']], wx.speed, (v) => { wx.speed = v; }));
      body.appendChild(opt2('Scan lines', [[false, 'Off'], [true, 'CRT look']], wx.scanLines, (v) => { wx.scanLines = v; }));
    } else if (step === 6) {
      const hs = draft.house = { tiles: [], ...(draft.house || {}) }; let hubCfg = { type: 'none', url: '', todoEntity: 'todo.shopping_list', hasToken: false }; let entities = null;
      body.appendChild(el('p', 'lead', 'Optional: connect a home hub. The House panel shows the tiles you pick, and the shopping list can sync with the hub\'s to-do list (voice assistants feed it). The hub address and token are stored on the server, never in the page.'));
      const typeRow = opt2('Hub', [['none', 'None'], ['homeassistant', 'Home Assistant'], ['homeio', 'Home-IO']], 'none', (v) => { hubCfg.type = v; paintHub(); }); body.appendChild(typeRow);
      const hubBox = el('div'); body.appendChild(hubBox);
      const urlI = text('', 'http://homeassistant.local:8123', (v) => { hubCfg.url = v.trim(); }); const tokI = el('input'); tokI.type = 'password'; tokI.placeholder = 'long-lived access token (leave blank to keep the saved one)'; tokI.autocomplete = 'off';
      const todoI = text('todo.shopping_list', 'todo.shopping_list', (v) => { hubCfg.todoEntity = v.trim(); });
      const tokLabel = field('Access token', tokI, 'Home Assistant → your profile → Security → Long-lived access tokens → Create. Home-IO: leave blank unless you enabled auth.');
      hubBox.append(field('Hub address', urlI, 'reachable from this server — a LAN address is fine'), tokLabel, field('Shopping to-do list entity', todoI, 'Home Assistant only; default is the built-in Shopping list'));
      const saveTest = testBtn('Save hub & test', async () => { await hub.save({ type: hubCfg.type, url: hubCfg.url, token: tokI.value || undefined, todoEntity: hubCfg.todoEntity }); tokI.value = ''; const r = await hub.test(); entities = await hub.entities(); drawEnts(); return `${r.message} — ${entities.length} entities available`; });
      hubBox.appendChild(saveTest);
      // tiles
      hubBox.appendChild(el('div', 'sect', 'House panel tiles'));
      const tileList = el('div', 'kid-list'); hubBox.appendChild(tileList);
      const drawTiles = () => { tileList.innerHTML = ''; hs.tiles.forEach((t, i) => { const row = el('div', 'kid-row'); row.append(text(t.label, 'Label', (v) => { t.label = v; }), el('span', 'eid', t.entity)); if (controllable(t.kind || tileKind({ id: t.entity }))) { const ctl = el('button', 'btn sm' + (t.control ? ' on' : ''), 'Tap to control'); ctl.type = 'button'; ctl.addEventListener('click', () => { t.control = !t.control; ctl.classList.toggle('on', !!t.control); }); row.appendChild(ctl); } const rm = el('button', 'btn sm danger', '×'); rm.type = 'button'; rm.addEventListener('click', () => { hs.tiles.splice(i, 1); drawTiles(); }); row.appendChild(rm); tileList.appendChild(row); }); if (!hs.tiles.length) tileList.appendChild(el('div', 'hint', 'no tiles yet — save & test the hub, then pick entities below')); };
      drawTiles();
      const search = text('', 'filter entities…', () => drawEnts()); const entList = el('div', 'ent-list'); hubBox.append(field('Add a tile', search), entList);
      const drawEnts = () => { entList.innerHTML = ''; if (!entities) { entList.appendChild(el('div', 'hint', 'save & test the hub to list entities')); return; } const q = norm2(search.value);
        entities.filter((e) => !q || norm2(e.name).includes(q) || norm2(e.id).includes(q)).slice(0, 60).forEach((e) => { const row = el('div', 'ent-row'); row.append(el('span', null, e.name), el('span', 'hint', `${tileKind(e)}${e.state != null ? ` · ${e.state}${e.unit ? ' ' + e.unit : ''}` : ''}`), el('span', 'eid', e.id));
          row.addEventListener('click', () => { if (!hs.tiles.some((t) => t.entity === e.id)) { const k = tileKind(e); hs.tiles.push({ entity: e.id, label: e.name, kind: k, control: k === 'onoff' || k === 'cover' }); drawTiles(); } }); entList.appendChild(row); }); };
      const norm2 = (s) => (s || '').toLowerCase();
      hubBox.appendChild(el('small', 'hint', 'Shopping-list sync is turned on per screen in ☰ Display → "Hub shopping sync" (one screen only, normally the wall display).'));
      const paintHub = () => { hubBox.hidden = hubCfg.type === 'none'; todoI.parentElement.hidden = hubCfg.type !== 'homeassistant'; };
      hub.status().then((s) => { hubCfg = { ...hubCfg, ...s }; urlI.value = s.url || ''; todoI.value = s.todoEntity || 'todo.shopping_list'; typeRow.querySelectorAll('.btn').forEach((b) => b.classList.toggle('on', b.textContent === ({ none: 'None', homeassistant: 'Home Assistant', homeio: 'Home-IO' })[s.type])); if (s.type !== 'none') { hub.entities().then((e) => { entities = e; drawEnts(); }).catch(() => {}); } paintHub(); }).catch(() => { hubBox.hidden = true; typeRow.hidden = true; body.appendChild(el('div', 'hint', 'No hub endpoint on this host (static hosting) — the House panel needs the local server or the PHP install.')); });
      paintHub(); drawEnts();
    } else if (step === 7) {
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
