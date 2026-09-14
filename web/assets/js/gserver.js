// Google Calendar through our own server (api/google.php), which holds the refresh token.
// Same surface as gcal.js so the rest of the app does not care which one is in use — except that
// this one never signs in: the display just asks its server, and the server keeps the connection.
const api = async (op, { method = 'GET', body, params } = {}) => {
  const q = new URLSearchParams({ op, ...(params || {}) }).toString();
  const r = await fetch(`api/google.php?${q}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || `google ${r.status}`); e.status = r.status; throw e; }
  return j;
};

export class GServer {
  constructor({ holidayCalendarId } = {}) {
    this.holidayCalendarId = holidayCalendarId || 'en.usa#holiday@group.v.calendar.google.com';
    this.signedIn = false; this.connected = false; this.configured = false;
    this.calendars = []; this.calendarId = 'primary'; this.status = null;
    this.onAuthChange = () => {};
  }
  get mode() { return 'server'; }
  async init() {
    this.status = await api('status');
    this.configured = !!this.status.configured; this.connected = !!this.status.connected;
    this.signedIn = this.connected;                      // "signed in" means the server can fetch
    this.ready = true;
    this.onAuthChange(this.signedIn, this.connected ? null : (this.status.lastError || null));
    return this.status;
  }
  /* nothing to renew in the page: the server refreshes its own token */
  needsRefresh() { return false; }
  async refresh() { return true; }
  requestToken() { /* no interactive sign-in on a wall display */ }
  async signOut() { await api('disconnect', { method: 'POST' }); this.connected = false; this.signedIn = false; this.onAuthChange(false); }

  async listCalendars() {
    const r = await api('calendars');
    this.calendars = r.calendars.map((c) => ({ id: c.id, summary: c.name, primary: c.primary }));
    if (this.calendarId === 'primary') { const p = this.calendars.find((c) => c.primary); if (p) this.calendarId = p.id; }
    return this.calendars;
  }
  listEvents(calendarId = this.calendarId) { return api('events', { params: { calendarId } }).then((r) => r.events); }
  listHolidays() { return this.holidayCalendarId ? api('events', { params: { calendarId: this.holidayCalendarId } }).then((r) => r.events).catch(() => []) : Promise.resolve([]); }
  insert(resource) { return api('insert', { method: 'POST', body: { calendarId: this.calendarId, resource } }); }
  update(eventId, resource) { return api('update', { method: 'POST', body: { calendarId: this.calendarId, eventId, resource } }); }
  remove(eventId) { return api('delete', { method: 'POST', body: { calendarId: this.calendarId, eventId } }); }

  /* wizard helpers */
  static status() { return api('status'); }
  static configure(clientId, clientSecret) { return api('configure', { method: 'POST', body: { clientId, clientSecret } }); }
  static connectUrl() { return 'api/google.php?op=authurl&go=1'; }
  static disconnect() { return api('disconnect', { method: 'POST' }); }
}
