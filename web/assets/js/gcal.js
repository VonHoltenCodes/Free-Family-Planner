// Google Calendar via gapi + Google Identity Services (token client).
const SCOPES = 'https://www.googleapis.com/auth/calendar';

export const loadScript = (src) => new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = src; s.async = true; s.onload = resolve; s.onerror = () => reject(new Error(`failed to load ${src}`));
  document.head.appendChild(s);
});

export class GCal {
  constructor({ clientId, holidayCalendarId } = {}) {
    this.clientId = clientId;
    this.holidayCalendarId = holidayCalendarId || 'en.usa#holiday@group.v.calendar.google.com';
    this.ready = false;
    this.signedIn = false;
    this.calendarId = 'primary';
    this.calendars = [];
    this.tokenClient = null;
    this.onAuthChange = () => {};
    this.expiresAt = 0;      // Google access tokens last about an hour; we renew before that
    this._pending = null;
  }

  async init() {
    if (!window.gapi) await loadScript('https://apis.google.com/js/api.js');
    if (!window.google?.accounts) await loadScript('https://accounts.google.com/gsi/client');
    await new Promise((r) => window.gapi.load('client', r));
    await window.gapi.client.init({});
    await window.gapi.client.load('calendar', 'v3');
    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: SCOPES,
      callback: (resp) => {
        const p = this._pending; this._pending = null;
        if (resp.error) { this.signedIn = false; this.expiresAt = 0; p?.reject(new Error(resp.error)); this.onAuthChange(false, resp.error); return; }
        this.signedIn = true;
        this.expiresAt = Date.now() + (Number(resp.expires_in || 3600) - 300) * 1000;   // renew 5 min early
        p?.resolve(true);
        this.onAuthChange(true);
      },
    });
    this.ready = true;
  }

  /* Silent re-auth (works when the user already granted access in this browser profile). */
  requestToken(silent = true) {
    if (!this.tokenClient) throw new Error('auth not ready');
    this.tokenClient.requestAccessToken({ prompt: silent ? '' : 'consent' });
  }

  /* Awaitable silent refresh — the wall never has anyone to click "sign in again". */
  refresh() {
    return new Promise((resolve, reject) => {
      if (!this.tokenClient) { reject(new Error('auth not ready')); return; }
      if (this._pending) { reject(new Error('a token request is already in flight')); return; }
      this._pending = { resolve, reject };
      const bail = setTimeout(() => { if (this._pending) { this._pending = null; reject(new Error('token refresh timed out')); } }, 20_000);
      const done = () => clearTimeout(bail);
      const p = this._pending; this._pending = { resolve: (v) => { done(); p.resolve(v); }, reject: (e) => { done(); p.reject(e); } };
      try { this.tokenClient.requestAccessToken({ prompt: '' }); } catch (e) { this._pending = null; done(); reject(e); }
    });
  }

  /* True when the token is missing or about to expire. */
  needsRefresh() { return this.signedIn && Date.now() >= this.expiresAt; }

  signOut() {
    const token = window.gapi.client.getToken();
    if (token) { window.google.accounts.oauth2.revoke(token.access_token); window.gapi.client.setToken(null); }
    this.signedIn = false; this.expiresAt = 0;
    this.onAuthChange(false);
  }

  static window() {
    const timeMin = new Date(); timeMin.setMonth(timeMin.getMonth() - 1);
    const timeMax = new Date(); timeMax.setMonth(timeMax.getMonth() + 3);
    return { timeMin: timeMin.toISOString(), timeMax: timeMax.toISOString() };
  }

  async listCalendars() {
    const r = await window.gapi.client.calendar.calendarList.list();
    this.calendars = r.result.items || [];
    if (this.calendarId === 'primary') {
      const p = this.calendars.find((c) => c.primary);
      if (p) this.calendarId = p.id;
    }
    return this.calendars;
  }

  async listEvents(calendarId = this.calendarId) {
    const r = await window.gapi.client.calendar.events.list({
      calendarId, ...GCal.window(), showDeleted: false, singleEvents: true, maxResults: 250, orderBy: 'startTime',
    });
    return r.result.items || [];
  }

  async listHolidays() {
    try {
      const r = await window.gapi.client.calendar.events.list({
        calendarId: this.holidayCalendarId, ...GCal.window(), showDeleted: false, singleEvents: true, maxResults: 50, orderBy: 'startTime',
      });
      return r.result.items || [];
    } catch (e) { console.log('holidays unavailable:', e); return []; }
  }

  insert(resource) { return window.gapi.client.calendar.events.insert({ calendarId: this.calendarId, resource }); }
  update(eventId, resource) { return window.gapi.client.calendar.events.update({ calendarId: this.calendarId, eventId, resource }); }
  remove(eventId) { return window.gapi.client.calendar.events.delete({ calendarId: this.calendarId, eventId }); }
}
