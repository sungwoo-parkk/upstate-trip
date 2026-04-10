// Copy this file to config.js and fill in your Firebase credentials.
// See FIREBASE_SETUP.md for step-by-step instructions.
//
//   cp js/config.example.js js/config.js
//
const FIREBASE_CONFIG = {
  apiKey:            'YOUR_API_KEY',
  authDomain:        'YOUR_PROJECT_ID.firebaseapp.com',
  projectId:         'YOUR_PROJECT_ID',
  storageBucket:     'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId:             'YOUR_APP_ID',
};

// Old Google Apps Script URL — used only by migrate.html
const OLD_SCRIPT_URL = 'PASTE_YOUR_OLD_SCRIPT_URL_HERE';

// ─── App Config ───────────────────────────────────────────────────────────────
const CONFIG = {
  FIREBASE_CONFIG,
  OLD_SCRIPT_URL,
  MEMBERS: ['Paul', 'Haley', 'Jason', 'Rebecca', 'Sojung', 'Eonbi', 'Ryan'],
  TOTAL_VOTERS:   7,
  MAJORITY:       4,
  DEFAULT_PEOPLE: 7,

  TRIP: {
    name:     'Upstate NY Trip',
    subtitle: 'May 8–10, 2026',
    days: [
      { date: '2026-05-08', label: 'Friday, May 8'   },
      { date: '2026-05-09', label: 'Saturday, May 9' },
      { date: '2026-05-10', label: 'Sunday, May 10'  },
    ],
  },
};
