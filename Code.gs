/**
 * Upstate NY Trip — Google Apps Script backend
 *
 * HOW TO DEPLOY
 * 1. Open your Google Sheet → Extensions → Apps Script
 * 2. Paste this entire file, replacing any existing code
 * 3. Run initSheets() once (click ▶ with that function selected)
 * 4. Deploy → New deployment → Web app
 *    • Execute as: Me
 *    • Who has access: Anyone
 * 5. Copy the web-app URL into js/config.js → SCRIPT_URL
 */

// ─── Sheet helpers ────────────────────────────────────────────────────────────

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function sheetToObjects(sheet) {
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const [headers, ...rows] = sheet.getDataRange().getValues();
  return rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
}

// ─── Init ─────────────────────────────────────────────────────────────────────

function initSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const defs = {
    Votes:     ['matchupId', 'voter', 'winnerId', 'timestamp'],
    Poll:      ['voter', 'airbnbId', 'timestamp'],
    Expenses:  ['id', 'description', 'amount', 'paidBy', 'splitAmong', 'date', 'addedBy'],
    Itinerary: ['id', 'date', 'time', 'title', 'description', 'addedBy', 'timestamp'],
  };
  for (const [name, headers] of Object.entries(defs)) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  }
  Logger.log('Sheets initialised ✓');
}

// ─── Request routing ──────────────────────────────────────────────────────────

function doGet(e) {
  // Write operations arrive as ?payload=... to avoid CORS preflight
  if (e.parameter.payload) {
    return handleWrite(JSON.parse(e.parameter.payload));
  }
  return jsonOut({
    votes:     sheetToObjects(getSheet('Votes')),
    pollVotes: sheetToObjects(getSheet('Poll')),
    expenses:  sheetToObjects(getSheet('Expenses')),
    itinerary: sheetToObjects(getSheet('Itinerary')),
  });
}

function doPost(e) {
  try {
    const data = JSON.parse(
      e.parameter.payload || (e.postData && e.postData.contents) || '{}'
    );
    return handleWrite(data);
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

function handleWrite(data) {
  try {
    switch (data.action) {
      case 'vote':            castVote(data);           break;
      case 'pollVote':        castPollVote(data);       break;
      case 'addExpense':      addExpense(data);         break;
      case 'deleteExpense':   deleteById('Expenses', data.id); break;
      case 'addItinerary':    addItinerary(data);       break;
      case 'deleteItinerary': deleteById('Itinerary', data.id); break;
      default: return jsonOut({ error: 'Unknown action: ' + data.action });
    }
    return jsonOut({ success: true });
  } catch (err) {
    return jsonOut({ error: err.message });
  }
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── Write handlers ───────────────────────────────────────────────────────────

function castVote(data) {
  const sheet = getSheet('Votes');
  removeRowWhere(sheet, row => row[0] === data.matchupId && row[1] === data.voter);
  sheet.appendRow([data.matchupId, data.voter, data.winnerId, new Date().toISOString()]);
}

function castPollVote(data) {
  const sheet = getSheet('Poll');
  removeRowWhere(sheet, row => row[0] === data.voter);
  sheet.appendRow([data.voter, data.airbnbId, new Date().toISOString()]);
}

function addExpense(data) {
  getSheet('Expenses').appendRow([
    Date.now().toString(),
    data.description,
    Number(data.amount),
    data.paidBy,
    Array.isArray(data.splitAmong) ? data.splitAmong.join(',') : data.splitAmong,
    data.date || new Date().toLocaleDateString('en-US'),
    data.addedBy || '',
  ]);
}

function addItinerary(data) {
  getSheet('Itinerary').appendRow([
    Date.now().toString(),
    data.date,
    data.time || '',
    data.title,
    data.description || '',
    data.addedBy || '',
    new Date().toISOString(),
  ]);
}

function deleteById(sheetName, id) {
  const sheet = getSheet(sheetName);
  removeRowWhere(sheet, row => String(row[0]) === String(id));
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function removeRowWhere(sheet, predicate) {
  if (sheet.getLastRow() <= 1) return;
  const data = sheet.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (predicate(data[i])) {
      sheet.deleteRow(i + 1);
      return; // remove first match only
    }
  }
}
