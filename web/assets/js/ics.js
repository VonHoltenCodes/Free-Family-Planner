// Minimal ICS (RFC 5545) parser for read-only calendar feeds: VEVENT with DTSTART/DTEND/DURATION,
// SUMMARY/LOCATION/DESCRIPTION, all-day vs timed, EXDATE, and the common RRULE subset
// (FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, INTERVAL, COUNT, UNTIL, BYDAY for WEEKLY). TZID times are
// treated as local wall-clock time; "Z" times are converted from UTC. Good enough for school,
// sports and shared family calendars; not a full iCalendar implementation.
const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DOWS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

function unfold(text) { return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, ''); }
function unescape(s) { return (s || '').replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\;/g, ';').replace(/\\\\/g, '\\'); }
function parseDate(value, params) {
  // returns {date: Date, allDay: bool}
  if (params.VALUE === 'DATE' || /^\d{8}$/.test(value)) { return { date: new Date(+value.slice(0, 4), +value.slice(4, 6) - 1, +value.slice(6, 8)), allDay: true }; }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/); if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const date = z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0))) : new Date(+y, +mo - 1, +d, +h, +mi, +(s || 0));
  return { date, allDay: false };
}
function parseDuration(v) { const m = v.match(/^(-)?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/); if (!m) return 0;
  const ms = ((+m[2] || 0) * 7 * 86400 + (+m[3] || 0) * 86400 + (+m[4] || 0) * 3600 + (+m[5] || 0) * 60 + (+m[6] || 0)) * 1000; return m[1] ? -ms : ms; }

export function parseICS(text) {
  const lines = unfold(text).split('\n'); const events = []; let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { props: {} }; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(':'); if (idx < 0) continue;
    const head = line.slice(0, idx); const value = line.slice(idx + 1);
    const [name, ...pp] = head.split(';'); const params = {}; pp.forEach((p) => { const [k, v] = p.split('='); params[k] = v; });
    const key = name.toUpperCase();
    if (key === 'EXDATE') { cur.props.EXDATE = cur.props.EXDATE || []; value.split(',').forEach((v) => cur.props.EXDATE.push({ value: v, params })); }
    else cur.props[key] = { value, params };
  }
  return events.map((e) => {
    const p = e.props; const start = p.DTSTART && parseDate(p.DTSTART.value, p.DTSTART.params); if (!start) return null;
    let end = p.DTEND ? parseDate(p.DTEND.value, p.DTEND.params) : null;
    if (!end) { const dur = p.DURATION ? parseDuration(p.DURATION.value) : (start.allDay ? 86400000 : 3600000); end = { date: new Date(start.date.getTime() + dur), allDay: start.allDay }; }
    return { uid: p.UID?.value || `${p.SUMMARY?.value}-${p.DTSTART.value}`, summary: unescape(p.SUMMARY?.value), location: unescape(p.LOCATION?.value), description: unescape(p.DESCRIPTION?.value),
      start: start.date, end: end.date, allDay: start.allDay, rrule: p.RRULE?.value || null, exdates: (p.EXDATE || []).map((x) => parseDate(x.value, x.params)?.date).filter(Boolean) };
  }).filter(Boolean);
}

/* Expand one parsed event into concrete occurrences inside [winStart, winEnd]. */
export function expandOccurrences(ev, winStart, winEnd) {
  const dur = ev.end.getTime() - ev.start.getTime();
  const ex = new Set(ev.exdates.map((d) => (ev.allDay ? dateKey(d) : d.getTime())));
  const emit = (s) => { const e = new Date(s.getTime() + dur); if (e < winStart || s > winEnd) return null; if (ex.has(ev.allDay ? dateKey(s) : s.getTime())) return null; return { start: s, end: e }; };
  if (!ev.rrule) { const o = emit(ev.start); return o ? [o] : []; }
  const rule = Object.fromEntries(ev.rrule.split(';').map((kv) => kv.split('=')));
  const freq = rule.FREQ; const interval = +(rule.INTERVAL || 1); const count = rule.COUNT ? +rule.COUNT : Infinity;
  const until = rule.UNTIL ? parseDate(rule.UNTIL, {})?.date : null; const hardEnd = until && until < winEnd ? until : winEnd;
  const byday = rule.BYDAY ? rule.BYDAY.split(',').map((d) => DOWS[d.slice(-2)]).filter((d) => d != null) : null;
  const out = []; let n = 0; let cursor = new Date(ev.start); let guard = 0;
  const push = (d) => { n += 1; const o = emit(d); if (o) out.push(o); };
  if (freq === 'WEEKLY' && byday && byday.length) {
    // walk week by week from the start week; emit each BYDAY in that week
    const weekStart = new Date(cursor); weekStart.setDate(cursor.getDate() - cursor.getDay());
    while (n < count && weekStart <= hardEnd && guard++ < 5000) {
      for (const dow of [...byday].sort()) { const d = new Date(weekStart); d.setDate(weekStart.getDate() + dow); d.setHours(cursor.getHours(), cursor.getMinutes(), 0, 0);
        if (d < ev.start || n >= count || d > hardEnd) continue; push(d); }
      weekStart.setDate(weekStart.getDate() + 7 * interval);
    }
    return out;
  }
  while (n < count && cursor <= hardEnd && guard++ < 5000) {
    push(new Date(cursor));
    if (freq === 'DAILY') cursor.setDate(cursor.getDate() + interval);
    else if (freq === 'WEEKLY') cursor.setDate(cursor.getDate() + 7 * interval);
    else if (freq === 'MONTHLY') cursor.setMonth(cursor.getMonth() + interval);
    else if (freq === 'YEARLY') cursor.setFullYear(cursor.getFullYear() + interval);
    else break;
  }
  return out;
}

/* Feed → planner event objects (Google-like shape) for the window. */
export function icsToEvents(text, winStart, winEnd, meta) {
  const out = [];
  parseICS(text).forEach((ev) => expandOccurrences(ev, winStart, winEnd).forEach((o, i) => {
    const toDate = (d) => dateKey(d);
    out.push({ id: `${meta.id}:${ev.uid}:${i}`, provider: meta.id, readOnly: true, color: meta.color, calendarName: meta.name,
      summary: ev.summary, location: ev.location, description: ev.description,
      start: ev.allDay ? { date: toDate(o.start) } : { dateTime: o.start.toISOString() },
      end: ev.allDay ? { date: toDate(o.end) } : { dateTime: o.end.toISOString() } });
  }));
  return out;
}
