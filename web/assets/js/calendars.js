// Calendar providers behind one interface: Google (read/write via gcal.js), ICS/iCal feeds
// (read-only, fetched through api/ics.php or directly when the host allows CORS), and a Local
// family calendar stored in the active data backend (read/write). planner.js only talks to this.
import { GCal } from './gcal.js';
import { icsToEvents } from './ics.js';
import * as store from './store.js';

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const windowRange = () => { const a = new Date(); a.setMonth(a.getMonth() - 1); const b = new Date(); b.setMonth(b.getMonth() + 3); return [a, b]; };
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export class Calendars {
  constructor(config) {
    this.config = config;
    const list = Array.isArray(config.calendars) && config.calendars.length ? config.calendars : [{ type: 'local', name: 'Family' }];
    this.ics = list.filter((c) => c.type === 'ics' && c.url).map((c, i) => ({ id: `ics${i}`, name: c.name || `Feed ${i + 1}`, url: c.url, color: c.color || '#c98bdb' }));
    this.local = list.find((c) => c.type === 'local') ? { id: 'local', name: list.find((c) => c.type === 'local').name || 'Family', color: list.find((c) => c.type === 'local').color || '#2bff66' } : null;
    this.google = config.googleClientId ? new GCal({ clientId: config.googleClientId, holidayCalendarId: config.holidayCalendarId }) : null;
    this.localEvents = []; this.icsCache = {}; this.onLocalChange = () => {};
    if (this.local && store.configured) store.watchEvents((items) => { this.localEvents = items; this.onLocalChange(); }, (e) => console.warn('local calendar:', e.message));
  }
  get hasGoogle() { return !!this.google; }
  get googleSignedIn() { return !!this.google?.signedIn; }
  /* writable targets for new events */
  writable() { const w = []; if (this.google?.signedIn) w.push({ id: 'google', name: 'Google Calendar' }); if (this.local && store.configured) w.push({ id: 'local', name: `${this.local.name} (local)` }); return w; }

  async loadAll() {
    const [a, b] = windowRange(); const out = []; const status = {};
    if (this.google?.signedIn) {
      const [ev, hol] = await Promise.all([this.google.listEvents(), this.google.listHolidays()]);
      ev.forEach((e) => out.push({ ...e, provider: 'google', readOnly: false }));
      hol.forEach((h) => out.push({ ...h, provider: 'holiday', readOnly: true, isHoliday: true }));
      status.google = ev.length;
    }
    for (const feed of this.ics) {
      try { const text = await this.fetchIcs(feed); const evs = icsToEvents(text, a, b, feed); out.push(...evs); status[feed.id] = evs.length; }
      catch (e) { console.warn(`ICS ${feed.name}:`, e.message); status[feed.id] = `error: ${e.message}`; }
    }
    if (this.local) out.push(...this.localEvents.map((e) => this.fromLocal(e)));
    this.status = status;
    return out;
  }
  async fetchIcs(feed) {
    const cached = this.icsCache[feed.id]; if (cached && Date.now() - cached.t < 10 * 60 * 1000) return cached.text;
    let text = null;
    try { const r = await fetch(feed.url, { cache: 'no-store' }); if (r.ok) text = await r.text(); } catch { /* CORS — use the proxy */ }
    if (text == null) { const r = await fetch(`api/ics.php?url=${encodeURIComponent(feed.url)}`, { cache: 'no-store' }); if (!r.ok) throw new Error(`proxy ${r.status}`); text = await r.text(); }
    if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error('not an ICS feed');
    this.icsCache[feed.id] = { t: Date.now(), text }; return text;
  }
  fromLocal(e) { return { id: e.id, provider: 'local', readOnly: false, color: this.local.color, calendarName: this.local.name, summary: e.summary, location: e.location, description: e.description,
    start: e.allDay ? { date: e.start } : { dateTime: e.start }, end: e.allDay ? { date: e.end } : { dateTime: e.end } }; }
  toLocal(resource) { return { summary: resource.summary, location: resource.location || '', description: resource.description || '', allDay: !!resource.start.date,
    start: resource.start.date || resource.start.dateTime, end: resource.end.date || resource.end.dateTime, updatedAt: new Date().toISOString() }; }

  async insert(target, resource) { if (target === 'google') return this.google.insert(resource); return store.putEvent(newId(), this.toLocal(resource)); }
  async update(ev, resource) { if (ev.provider === 'google') return this.google.update(ev.id, resource); return store.putEvent(ev.id, this.toLocal(resource)); }
  async remove(ev) { if (ev.provider === 'google') return this.google.remove(ev.id); return store.deleteEvent(ev.id); }
}
export { dateKey };
