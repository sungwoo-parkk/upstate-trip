A group trip website with:
- **Trip itinerary** (editable by the group)
- **AirBnb bracket vote** (16 options → knockout rounds → final poll)
- **Expense tracker** with automatic settlement calculations

---

## Setup (one-time, ~10 minutes)

### 1. Create the Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet.
2. Name it something like **"Upstate Trip Data"**.

### 2. Deploy the Apps Script backend

1. Inside the spreadsheet, open **Extensions → Apps Script**.
2. Delete the default `myFunction()` code.
3. Copy the entire contents of `Code.gs` (in this repo) and paste it.
4. Click **Save** (💾).
5. In the function dropdown (top toolbar), select **`initSheets`** and click **▶ Run**. Accept permissions when prompted. This creates the four data sheets.
6. Click **Deploy → New deployment**.
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
7. Click **Deploy**, then copy the **Web app URL** (looks like `https://script.google.com/macros/s/ABC.../exec`).

### 3. Add the URL to the site

Open `js/config.js` and paste the URL:

```js
const SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_ID_HERE/exec';
```

### 4. (Optional) Fill in AirBnb listings

Still in `js/config.js`, update the `AIRBNBS` array with real listing details:

```js
{ id: 1, name: 'Cozy Cabin in Woodstock', url: 'https://airbnb.com/...', description: '4BR, hot tub', image: '' },
```

### 5. Publish to GitHub Pages

```bash
git init
git add .
git commit -m "Upstate NY trip site"
# Create a new repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/upstate-trip.git
git push -u origin main
```

Then in the GitHub repo → **Settings → Pages → Source: Deploy from branch → main → / (root)** → Save.

Your site will be live at `https://YOUR_USERNAME.github.io/upstate-trip/`.

---

## How the bracket works

- **16 AirBnb options** seeded into 8 first-round matchups
- **First to 4 votes** (majority of 7) wins a matchup — or whoever leads after all 7 vote
- **3 knockout rounds** → 2 finalists → **final poll**
- Each person picks their name from the dropdown before voting — votes are saved to Google Sheets and shared in real time

## Expenses

- Anyone can log an expense (description, amount, who paid, who splits)
- The **Balances** section shows each person's net position
- The **Settlements** section shows the minimum transactions to settle up

---

## File structure

```
upstate-trip/
├── index.html          Main site
├── css/style.css       Styles
├── js/
│   ├── config.js       ← Edit this: SCRIPT_URL + AirBnb listings
│   └── app.js          App logic
└── Code.gs             Google Apps Script (paste into your Sheet)
```
