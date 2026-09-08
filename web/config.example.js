// Free Family Planner — site configuration.
// Copy to config.js and fill in your own values. config.js is gitignored.
export default {
  // What new displays show: 'family' (planner), 'command' (home central command: house controls,
  // weather, calendar), or 'both' (tabs). Each display can override this in ☰ Display.
  defaultMode: 'both',
  family: {
    title: 'OUR FAMILY',            // header, line 1
    subtitle: 'CENTRAL COMMAND',    // header, line 2
    footer: ['FAMILY COMMAND CENTER', 'EST. 2025', 'YOUR TOWN, ST'],
    kids: [                         // chore board columns (any number; 3 chores each)
      { id: 'kid1', name: 'Kid One', color: '#ff69b4' },
      { id: 'kid2', name: 'Kid Two', color: '#4169e1' },
    ],
  },
  location: {
    label: 'Your Town, ST',         // shown on the WeatherStar panel
    lat: 41.8781, lon: -87.6298,    // WeatherStar + outside temp (NWS, US only)
  },
  // Where lists, meals, chores (and the local calendar) live:
  //   'firestore' — Firebase Firestore (cloud; phones + wall stay in sync)
  //   'sync'      — self-hosted store on this same server (api/db.php or tools/serve.py); no cloud account
  //   'local'     — this browser only
  backend: 'sync',
  // Firebase web app config (Project settings → Your apps → Web app) — only for backend: 'firestore'.
  firebase: {
    apiKey: '', authDomain: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: '',
  },
  // Google Cloud OAuth 2.0 Web client ID with the Calendar API enabled and your site as an authorized origin.
  googleClientId: '',
  holidayCalendarId: 'en.usa#holiday@group.v.calendar.google.com',
  // Calendars shown together on the grid. Google (above) is added automatically when signed in.
  //   local — a family calendar stored in your data backend (read/write, no account)
  //   ics   — any iCal/ICS feed URL (iCloud "public calendar", Outlook "publish", school/sports sites); read-only
  calendars: [
    { type: 'local', name: 'Family', color: '#2bff66' },
    // { type: 'ics', name: 'School', url: 'https://example.org/calendar.ics', color: '#c98bdb' },
    // { type: 'ha', entity: 'calendar.family', name: 'HA Family', color: '#7d9bff' },   // a Home Assistant calendar (hub must be connected)
  ],
  // Weather panel. provider: 'auto' (WeatherStar 4000+ where the US National Weather Service has
  // data, otherwise an Open-Meteo conditions card), or force 'weatherstar' / 'card'.
  // screens: which WeatherStar screens rotate (ids: hazards, current-weather, latest-observations,
  // hourly, hourly-graph, travel, regional-forecast, local-forecast, extended-forecast, almanac,
  // spc-outlook, radar). speed: 0.5–2. scanLines: CRT look.
  weather: { provider: 'auto', screens: { hourly: false, travel: false }, speed: 1, scanLines: false },
  // House panel tiles from your home hub (Home Assistant or Home-IO). The hub URL + token are NOT
  // here — the ⚙ wizard stores them server-side. Pick tiles in the wizard; kind is inferred from
  // the entity (climate, door, presence, lock, onoff, value) or set it explicitly.
  house: { tiles: [
    // { entity: 'climate.hallway', label: 'Hallway' },
    // { entity: 'binary_sensor.front_door', label: 'Front door' },
    // { entity: 'light.kitchen', label: 'Kitchen lights', control: true },   // control: tap to toggle / lock / open
  ] },
};
