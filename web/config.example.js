// Free Family Planner — site configuration.
// Copy to config.js and fill in your own values. config.js is gitignored.
export default {
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
  // Firebase web app config (Project settings → Your apps → Web app). Firestore is the data store.
  firebase: {
    apiKey: '', authDomain: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: '',
  },
  // Google Cloud OAuth 2.0 Web client ID with the Calendar API enabled and your site as an authorized origin.
  googleClientId: '',
  holidayCalendarId: 'en.usa#holiday@group.v.calendar.google.com',
};
