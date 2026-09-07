# Calendar providers: ICS/iCal URLs, CalDAV, local-only calendar

Tracking issue: #5 · Branch: `feat/calendar-providers`

## Goal
Google Calendar is the only provider today. Add read-only ICS/iCal URL feeds (iCloud, Outlook, school calendars), CalDAV, and a purely local calendar for the no-cloud install. Provider interface: listEvents(window), insert/update/remove (optional).

## Design notes
- `calendars.js` merges providers into one event list in the Google event shape (`start.date` / `start.dateTime`) plus `provider`, `readOnly`, `color`, `calendarName`. planner.js never sees a provider directly.
- ICS: `ics.js` is a small RFC 5545 parser (VEVENT, DTEND/DURATION, EXDATE, RRULE DAILY/WEEKLY(BYDAY)/MONTHLY/YEARLY with INTERVAL/COUNT/UNTIL). TZID times are taken as local wall-clock; Z times converted. Feeds are tried directly, then via `api/ics.php` / the same route in `serve.py`; the proxy only allows URLs present in `config.js`.
- Local calendar: `events` collection in the active data backend (`{summary, location, description, allDay, start, end}`); editable from the wall; syncs like lists.
- New events go to Google when signed in, else the local calendar (a Calendar picker appears in the modal when both are available). Feed events open read-only.
- CalDAV is deferred: it needs server-side auth plumbing per provider; ICS covers the read-only cases people actually asked for.

## Checklist
- [x] provider layer + ICS parser (unit-tested) + proxies (PHP, serve.py)
- [x] local family calendar (add/edit/delete, synced through the backend)
- [x] wizard Calendars step with feed test
- [x] README / ROADMAP updated
