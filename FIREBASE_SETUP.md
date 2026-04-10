# Firebase Setup Guide

Follow these steps to connect the site to Firebase Firestore. Takes about 10 minutes.

---

## Step 1 — Create a Firebase Project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project**
3. Name it (e.g. `upstate-trip`) → Continue
4. Disable Google Analytics (not needed) → **Create project**
5. Wait for it to provision, then click **Continue**

---

## Step 2 — Add a Web App

1. On the project overview page, click the **</>** (Web) icon
2. Register app — give it a nickname (e.g. `upstate-web`) — **don't** enable Firebase Hosting
3. Click **Register app**
4. You'll see a `firebaseConfig` object like this:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "upstate-trip.firebaseapp.com",
  projectId: "upstate-trip",
  storageBucket: "upstate-trip.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

5. Copy those values — you'll need them in Step 5.
6. Click **Continue to console**

---

## Step 3 — Enable Firestore

1. In the left sidebar, click **Build → Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** → Next
4. Pick any Cloud Firestore location (e.g. `nam5 (us-central)`) → **Enable**

> **Note:** Test mode allows open read/write for 30 days. That's fine for a private group trip. After 30 days you can either extend or add a simple security rule.

---

## Step 4 — (Optional) Extend Security Rules

If you want to extend past 30 days without adding auth, go to **Firestore → Rules** and replace the content with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

Then click **Publish**. This keeps open access — only share the site URL with your group.

---

## Step 5 — Update js/config.js

Open `js/config.js` and replace the placeholder values with your real Firebase config:

```js
const FIREBASE_CONFIG = {
  apiKey:            'AIzaSy...',           // ← your real value
  authDomain:        'upstate-trip.firebaseapp.com',
  projectId:         'upstate-trip',
  storageBucket:     'upstate-trip.appspot.com',
  messagingSenderId: '123456789',
  appId:             '1:123456789:web:abc123',
};
```

Save the file.

---

## Step 6 — Migrate Existing Data (optional)

If you have data in the old Google Sheet, use the migration tool to copy it to Firestore.

1. Open `migrate.html` in your browser (e.g. `file:///...path.../migrate.html`, or via GitHub Pages at `https://sungwoo-parkk.github.io/upstate-trip/migrate.html`)
2. Paste your Firebase **API Key**, **Project ID**, and **App ID** into the form
3. Click **Start Migration**
4. Watch the log — it should end with `✅ Migration complete!`

The migration is safe to run multiple times; it overwrites docs with the same ID.

---

## Step 7 — Deploy to GitHub Pages

```bash
cd /Users/sungwoopark/upstate-trip/upstate-trip
git add -A
git commit -m "Add Firebase backend + Budget estimates tab"
git push origin main
```

The site will be live at `https://sungwoo-parkk.github.io/upstate-trip/` within a minute.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Firebase App named '[DEFAULT]' already exists" | Page reloaded — harmless, refresh and try again |
| Blank page / console errors about Firebase | Check `apiKey`, `projectId`, `appId` in `config.js` |
| "Missing or insufficient permissions" | Go to Firestore → Rules and check they allow read/write |
| Data not appearing in real time | Make sure you're not blocking WebSocket connections (VPN, firewall) |
