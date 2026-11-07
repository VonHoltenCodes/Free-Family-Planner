// Demo mode: the whole planner on fictional sample data, for photos, screenshots and show-and-tell.
// Picked from the calendar header ("Demo (sample data)"); the flag lives in this browser only, and
// nothing real is read or written while it is on — lists, chores, meals and the calendar all come
// from the in-memory dataset below, Google and the home hub are left alone.
export const DEMO_KEY = 'fp.demo';
export const DEMO_ID = 'demo';

/* ?demo=1 / ?demo=0 on the page URL flips the flag (so a kiosk can be switched from afar, e.g.
   `ffp wall demo on`), then the parameter is dropped from the address bar. */
export function isDemo() {
  try {
    const q = new URLSearchParams(location.search).get('demo');
    if (q === '1' || q === '0') {
      if (q === '1') localStorage.setItem(DEMO_KEY, '1'); else localStorage.removeItem(DEMO_KEY);
      const u = new URL(location.href); u.searchParams.delete('demo'); history.replaceState(null, '', u);
    }
    return localStorage.getItem(DEMO_KEY) === '1';
  } catch { return false; }
}
export function enterDemo() { try { localStorage.setItem(DEMO_KEY, '1'); } catch { /* ignore */ } location.reload(); }
export function exitDemo() { try { localStorage.removeItem(DEMO_KEY); } catch { /* ignore */ } location.reload(); }

const KIDS = [{ id: 'demo-emma', name: 'Emma', color: '#ff69b4' }, { id: 'demo-jack', name: 'Jack', color: '#4169e1' }];

/* Rewrites a loaded config so every panel runs on sample data. Location (and so the weather) is kept. */
export function applyConfig(config) {
  config.demo = true;
  config.family = { ...config.family, title: 'THE PARKER FAMILY', subtitle: 'CENTRAL COMMAND', footer: ['FAMILY COMMAND CENTER', 'EST. 2025', 'SAMPLE DATA'], kids: KIDS };
  config.backend = 'demo';
  config.google = { mode: 'none' }; config.googleClientId = '';
  config.calendars = [{ type: 'local', name: 'Demo', color: '#2bff66' }];
  config.house = { tiles: [] };
  return config;
}

const pad = (n) => String(n).padStart(2, '0');
const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const day = (offset) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset); return d; };
const plus = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const at = (d, hm) => `${key(d)}T${hm}:00`;
const stamp = (i) => new Date(Date.now() - i * 60_000).toISOString();

/* US holidays for a year, as [month, day, name] — fixed dates plus the floating Monday/Thursday ones. */
function holidays(y) {
  const nth = (m, dow, n) => { const d = new Date(y, m, 1); d.setDate(1 + ((dow - d.getDay() + 7) % 7) + (n - 1) * 7); return d.getDate(); };
  const lastMon = (m) => { const d = new Date(y, m + 1, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getDate(); };
  return [[0, 1, "New Year's Day"], [0, nth(0, 1, 3), 'Martin Luther King Jr. Day'], [1, 14, "Valentine's Day"], [1, nth(1, 1, 3), "Presidents' Day"],
    [2, 17, "St. Patrick's Day"], [4, nth(4, 0, 2), "Mother's Day"], [4, lastMon(4), 'Memorial Day'], [5, nth(5, 0, 3), "Father's Day"], [6, 4, 'Independence Day'],
    [8, nth(8, 1, 1), 'Labor Day'], [9, 31, 'Halloween'], [10, 11, 'Veterans Day'], [10, nth(10, 4, 4), 'Thanksgiving'], [11, 24, 'Christmas Eve'], [11, 25, 'Christmas Day'], [11, 31, "New Year's Eve"]];
}

/* The sample dataset, generated around today so it never goes stale. Shape = the local backend's. */
export function sampleData() {
  const events = {};
  const put = (id, summary, start, end, extra = {}) => { events[id] = { summary, location: '', description: '', updatedAt: stamp(0), start, end, allDay: !start.includes('T'), ...extra }; };
  const allDay = (id, summary, d, days = 1, extra) => put(id, summary, key(d), key(plus(d, days)), extra);
  const timed = (id, summary, d, from, to, extra) => put(id, summary, at(d, from), at(d, to), extra);

  const first = day(-40); const last = day(100);
  for (let d = new Date(first); d <= last; d = plus(d, 1)) {
    const k = key(d);
    switch (d.getDay()) {
      case 1: allDay(`trash-${k}`, 'Trash & recycling out', d); break;
      case 2: case 4: timed(`soccer-${k}`, 'Emma — soccer practice', d, '17:00', '18:30', { location: 'Riverside Park, field 3' }); break;
      case 3: timed(`piano-${k}`, 'Jack — piano lesson', d, '16:00', '16:45', { location: "Ms. Patel's studio" }); break;
      case 5: timed(`pizza-${k}`, 'Pizza night', d, '18:00', '19:00'); if (Math.floor((d - first) / 864e5 / 7) % 2 === 0) timed(`payday-${k}`, 'Payday', d, '07:00', '08:00'); break;
      case 6: timed(`swim-${k}`, 'Swim lessons', d, '10:00', '11:00', { location: 'Community pool' }); break;
      default: break;
    }
  }
  for (const y of [first.getFullYear(), last.getFullYear()]) {
    holidays(y).forEach(([m, dd, name]) => { const d = new Date(y, m, dd); if (d >= first && d <= last) allDay(`holiday-${key(d)}`, name, d, 1, { isHoliday: true }); });
  }
  const one = [
    [-10, 'Book report due', null], [-6, 'Soccer game vs. Tigers', ['09:00', '10:30'], 'Riverside Park'], [-2, 'Vet — Biscuit', ['10:00', '10:30'], 'Lakeside Animal Clinic'],
    [1, 'Dentist — Emma', ['15:30', '16:15'], 'Dr. Alvarez'], [3, 'Date night', ['19:00', '21:30'], "Luigi's"], [5, 'Grandma visits', null, '', 2],
    [9, 'Jack — science fair', ['18:00', '19:30'], 'School gym'], [12, 'No school — teacher institute', null], [16, "Mia's birthday party", ['14:00', '16:00'], 'Jump Zone'],
    [20, 'Car — oil change', ['09:00', '10:00'], 'Main St. Auto'], [25, 'Parent-teacher conferences', ['16:00', '19:00'], 'Lincoln Elementary'], [33, 'Family movie night', ['19:00', '21:00']],
    [40, 'Book fair', null], [47, 'Emma — field trip', ['08:30', '14:00'], 'Science museum'], [55, 'Camping weekend', null, '', 3],
  ];
  one.forEach(([off, summary, hm, location = '', days = 1], i) => {
    const d = day(off);
    if (hm) timed(`one-${i}`, summary, d, hm[0], hm[1], { location }); else allDay(`one-${i}`, summary, d, days, { location });
  });

  const list = (items) => Object.fromEntries(items.map(([text, completed], i) => [`demo-${i}`, { text, completed, createdAt: stamp(i) }]));
  return {
    shopping: list([['Milk', false], ['Eggs', false], ['Bananas', false], ['Dog food', false], ['Paper towels', true], ['Birthday card for Mia', false]]),
    notes: list([['Pizza night Friday — Jack picks the movie', false], ['Field trip form due Thursday', false], ['Call plumber about the sink', true]]),
    meals: { Sunday: 'Roast chicken', Monday: 'Tacos', Tuesday: 'Spaghetti', Wednesday: 'Stir fry', Thursday: 'Leftovers', Friday: 'Pizza night', Saturday: 'Burgers on the grill' },
    chores: {
      'demo-emma': [{ id: 0, text: 'Make bed', completed: true }, { id: 1, text: 'Feed Biscuit', completed: false }, { id: 2, text: 'Practice spelling', completed: false }],
      'demo-jack': [{ id: 0, text: 'Clear the table', completed: true }, { id: 1, text: 'Take out trash', completed: false }, { id: 2, text: 'Piano — 20 min', completed: false }],
    },
    events,
  };
}
