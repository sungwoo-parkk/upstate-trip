# Upstate NY Trip · May 8–10, 2026

A group trip planning website for 7 people. Live at [sungwoo-parkk.github.io/upstate-trip](https://sungwoo-parkk.github.io/upstate-trip/).

## Features

- **Trip itinerary** — add events with day, time, and notes; editable by the whole group
- **AirBnb bracket vote** — submit listings, run a knockout bracket (supports any even number of listings), vote in real time
- **Polls** — create questions with custom options; group votes in real time
- **Expense tracker** — log expenses with flexible splits; automatic settlement calculations
- **Budget estimates** — enter estimated costs (AirBnb, food, tolls, activities, gas) per listing; shared in real time
- **Compare finalists** — side-by-side budget breakdown of the two bracket finalists
- **Grocery list** — embedded Google Sheet for collaborative grocery planning

## Tech stack

- Static HTML/CSS/JS — no build step
- **Firebase Firestore** for real-time data sync across all users
- Hosted on **GitHub Pages**

## Firebase config

The Firebase project config is inlined in `index.html`. Firebase web API keys are designed to be public — security is enforced via Firestore security rules, not key secrecy. See [Firebase docs](https://firebase.google.com/docs/projects/api-keys) for details.

## File structure

```
upstate-trip/
├── index.html           Main site (Firebase config inlined here)
├── css/style.css        Styles
├── js/
│   ├── app.js           All app logic
│   └── config.example.js  Template showing config shape (placeholder values)
├── migrate.html         One-time migration tool (Sheets → Firebase, already run)
├── Code.gs              Old Google Apps Script backend (no longer used)
└── FIREBASE_SETUP.md    Firebase project setup instructions
```

## How the bracket works

- Group members submit AirBnb listings via the AirBnb Vote tab
- Once all listings are in, an admin locks the bracket (supports any even number of listings — odd counts drop the last entry; non-power-of-2 counts use byes for top seeds)
- **First to 4 votes** (majority of 7) wins a matchup, or whoever leads after all 7 vote
- Knockout rounds continue until 2 finalists remain → **final poll**
- The Compare tab shows a side-by-side budget breakdown of the two finalists

## Expenses

- Anyone can log an expense (description, amount, who paid, who splits)
- **Balances** shows each person's net position
- **Settlements** shows the minimum transactions needed to settle up
