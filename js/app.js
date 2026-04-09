/* ═══════════════════════════════════════════════════════════════════════════
   Upstate NY Trip — Main App
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── State ────────────────────────────────────────────────────────────────────

let state = {
  currentUser: localStorage.getItem('currentUser') || '',
  votes:       [],
  pollVotes:   [],
  expenses:    [],
  itinerary:   [],
  loading:     false,
};

// ─── API ──────────────────────────────────────────────────────────────────────

async function api(payload) {
  if (!CONFIG.SCRIPT_URL) {
    showToast('⚠️ SCRIPT_URL not set in config.js', 'error');
    throw new Error('SCRIPT_URL not configured');
  }
  const url = CONFIG.SCRIPT_URL + '?payload=' + encodeURIComponent(JSON.stringify(payload));
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

async function loadData() {
  if (!CONFIG.SCRIPT_URL) return;
  try {
    const url = CONFIG.SCRIPT_URL;
    const res = await fetch(url);
    const json = await res.json();
    state.votes     = json.votes     || [];
    state.pollVotes = json.pollVotes || [];
    state.expenses  = json.expenses  || [];
    state.itinerary = json.itinerary || [];
    renderAll();
  } catch (e) {
    console.error('Load failed:', e);
    showToast('Failed to load data — check console', 'error');
  }
}

// ─── Bracket logic ────────────────────────────────────────────────────────────

function getVotesFor(matchupId) {
  return state.votes.filter(v => v.matchupId === matchupId);
}

function getMatchupResult(matchupId, aId, bId) {
  const votes = getVotesFor(matchupId);
  const aVotes = votes.filter(v => String(v.winnerId) === String(aId)).length;
  const bVotes = votes.filter(v => String(v.winnerId) === String(bId)).length;
  const winner =
    aVotes >= CONFIG.MAJORITY ? aId :
    bVotes >= CONFIG.MAJORITY ? bId :
    (aVotes + bVotes) === CONFIG.TOTAL_VOTERS
      ? (aVotes > bVotes ? aId : bId)
      : null;
  return { aVotes, bVotes, winner };
}

// Returns array of {matchupId, a, b} for each round
function buildBracket() {
  const rounds = [];
  // Round 1 — fixed seeding
  const r1 = CONFIG.BRACKET_R1.map(([ai, bi], idx) => ({
    matchupId: `R1M${idx + 1}`,
    a: CONFIG.AIRBNBS[ai],
    b: CONFIG.AIRBNBS[bi],
  }));
  rounds.push(r1);

  // Rounds 2 & 3 — winners of previous round
  for (let r = 2; r <= 3; r++) {
    const prev = rounds[r - 2];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      const mA = prev[i];
      const mB = prev[i + 1];
      const resA = getMatchupResult(mA.matchupId, mA.a.id, mA.b.id);
      const resB = getMatchupResult(mB.matchupId, mB.a.id, mB.b.id);
      const winnerA = resA.winner ? CONFIG.AIRBNBS.find(x => x.id === resA.winner) : null;
      const winnerB = resB.winner ? CONFIG.AIRBNBS.find(x => x.id === resB.winner) : null;
      next.push({
        matchupId: `R${r}M${next.length + 1}`,
        a: winnerA,
        b: winnerB,
      });
    }
    rounds.push(next);
  }
  return rounds;
}

function getFinalists() {
  const rounds = buildBracket();
  const r3 = rounds[2];
  const results = r3.map(m => m.a && m.b
    ? getMatchupResult(m.matchupId, m.a.id, m.b.id)
    : null);
  return r3.map((m, i) =>
    results[i] && results[i].winner
      ? CONFIG.AIRBNBS.find(x => x.id === results[i].winner)
      : null
  );
}

function bracketComplete() {
  const finalists = getFinalists();
  return finalists[0] !== null && finalists[1] !== null;
}

// ─── Expense logic ────────────────────────────────────────────────────────────

function calcSettlements() {
  const balance = {}; // positive = owed money, negative = owes money
  CONFIG.MEMBERS.forEach(m => balance[m] = 0);

  state.expenses.forEach(exp => {
    const amount = Number(exp.amount);
    const paidBy = exp.paidBy;
    const splitAmong = String(exp.splitAmong).split(',').map(s => s.trim()).filter(Boolean);
    if (!splitAmong.length) return;
    const share = amount / splitAmong.length;
    balance[paidBy] = (balance[paidBy] || 0) + amount;
    splitAmong.forEach(person => {
      balance[person] = (balance[person] || 0) - share;
    });
  });

  // Simplify debts
  const debtors  = Object.entries(balance).filter(([, v]) => v < -0.005).map(([n, v]) => ({ name: n, amount: -v }));
  const creditors = Object.entries(balance).filter(([, v]) => v >  0.005).map(([n, v]) => ({ name: n, amount: v }));
  const settlements = [];

  let d = 0, c = 0;
  while (d < debtors.length && c < creditors.length) {
    const pay = Math.min(debtors[d].amount, creditors[c].amount);
    settlements.push({ from: debtors[d].name, to: creditors[c].name, amount: pay });
    debtors[d].amount   -= pay;
    creditors[c].amount -= pay;
    if (debtors[d].amount   < 0.005) d++;
    if (creditors[c].amount < 0.005) c++;
  }
  return { balance, settlements };
}

// ─── Render helpers ───────────────────────────────────────────────────────────

function fmt$(n) { return '$' + Number(n).toFixed(2); }

function airbnbCard(ab, compact = false) {
  const hasLink = ab && ab.url;
  const img = ab && ab.image
    ? `<img src="${ab.image}" alt="${ab.name}" class="ab-img">`
    : `<div class="ab-img ab-img-placeholder">#${ab ? ab.id : '?'}</div>`;
  if (!ab) return `<div class="ab-card ab-card-empty">TBD</div>`;
  return `
    <div class="ab-card ${compact ? 'ab-card-compact' : ''}">
      ${img}
      <div class="ab-info">
        <div class="ab-name">${ab.name}</div>
        ${ab.description && !compact ? `<div class="ab-desc">${ab.description}</div>` : ''}
        ${hasLink ? `<a href="${ab.url}" target="_blank" class="ab-link">View listing ↗</a>` : ''}
      </div>
    </div>`;
}

// ─── Render: Itinerary ────────────────────────────────────────────────────────

function renderTrip() {
  const container = document.getElementById('itinerary-container');
  container.innerHTML = CONFIG.TRIP.days.map(({ date, label }) => {
    const items = state.itinerary
      .filter(e => e.date === date)
      .sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    const itemsHtml = items.length
      ? items.map(item => `
          <div class="itinerary-item">
            <div class="itinerary-time">${item.time || '—'}</div>
            <div class="itinerary-body">
              <div class="itinerary-title">${item.title}</div>
              ${item.description ? `<div class="itinerary-desc">${item.description}</div>` : ''}
              <div class="itinerary-meta">Added by ${item.addedBy || 'unknown'}</div>
            </div>
            ${state.currentUser ? `<button class="btn-icon delete-event" data-id="${item.id}" title="Delete">✕</button>` : ''}
          </div>`).join('')
      : `<p class="empty-note">No events yet. Add one above!</p>`;

    return `
      <div class="day-card">
        <h3 class="day-label">${label}</h3>
        <div class="itinerary-list">${itemsHtml}</div>
      </div>`;
  }).join('');

  // Delete handlers
  container.querySelectorAll('.delete-event').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this event?')) return;
      await api({ action: 'deleteItinerary', id: btn.dataset.id });
      state.itinerary = state.itinerary.filter(e => e.id !== btn.dataset.id);
      renderTrip();
      showToast('Event deleted');
    });
  });
}

// ─── Render: Bracket ─────────────────────────────────────────────────────────

function renderBracket() {
  const view = document.getElementById('bracket-view');

  if (bracketComplete()) {
    renderPoll(view);
    return;
  }

  const rounds = buildBracket();
  const roundLabels = ['Round 1', 'Round 2', 'Round 3'];

  const bracketHtml = rounds.map((matchups, ri) => {
    const matchupsHtml = matchups.map(m => renderMatchup(m, ri + 1)).join('');
    return `
      <div class="bracket-round">
        <div class="round-label">${roundLabels[ri]}</div>
        <div class="matchups">${matchupsHtml}</div>
      </div>`;
  }).join('');

  view.innerHTML = `
    <div class="bracket-header">
      <h2>AirBnb Bracket</h2>
      <p class="bracket-subtext">First to ${CONFIG.MAJORITY} votes advances · ${CONFIG.TOTAL_VOTERS} voters</p>
    </div>
    <div class="bracket-scroll-wrap">
      <div class="bracket">${bracketHtml}</div>
    </div>`;

  view.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', () => handleVote(btn));
  });
}

function renderMatchup(m, round) {
  const prev = round > 1;
  const locked = !m.a || !m.b; // waiting on earlier round

  if (locked) {
    return `
      <div class="matchup matchup-locked">
        <div class="matchup-slot slot-tbd">TBD</div>
        <div class="matchup-vs">vs</div>
        <div class="matchup-slot slot-tbd">TBD</div>
      </div>`;
  }

  const { aVotes, bVotes, winner } = getMatchupResult(m.matchupId, m.a.id, m.b.id);
  const userVote = state.votes.find(
    v => v.matchupId === m.matchupId && v.voter === state.currentUser
  );
  const total = aVotes + bVotes;
  const decided = winner !== null;

  const slotHtml = (ab, voteCount, isWinner) => {
    const pct = total > 0 ? Math.round((voteCount / total) * 100) : 0;
    const canVote = state.currentUser && !decided;
    const voted = userVote && String(userVote.winnerId) === String(ab.id);
    return `
      <div class="matchup-slot ${isWinner ? 'slot-winner' : ''} ${decided && !isWinner ? 'slot-loser' : ''}">
        <div class="slot-name">${ab.name}</div>
        ${ab.url ? `<a href="${ab.url}" target="_blank" class="slot-link">↗</a>` : ''}
        <div class="slot-bar-wrap">
          <div class="slot-bar" style="width:${pct}%"></div>
        </div>
        <div class="slot-votes">${voteCount} vote${voteCount !== 1 ? 's' : ''}</div>
        ${canVote ? `<button class="vote-btn ${voted ? 'voted' : ''}"
          data-matchup="${m.matchupId}"
          data-winner="${ab.id}">${voted ? '✓ Voted' : 'Vote'}</button>` : ''}
      </div>`;
  };

  return `
    <div class="matchup ${decided ? 'matchup-done' : ''}">
      ${slotHtml(m.a, aVotes, winner === m.a.id)}
      <div class="matchup-vs">vs</div>
      ${slotHtml(m.b, bVotes, winner === m.b.id)}
    </div>`;
}

async function handleVote(btn) {
  if (!state.currentUser) {
    showToast('Select your name first!', 'error');
    return;
  }
  btn.disabled = true;
  try {
    const payload = {
      action:    'vote',
      matchupId: btn.dataset.matchup,
      voter:     state.currentUser,
      winnerId:  Number(btn.dataset.winner),
    };
    await api(payload);
    // Optimistic update
    state.votes = state.votes.filter(
      v => !(v.matchupId === payload.matchupId && v.voter === payload.voter)
    );
    state.votes.push({ matchupId: payload.matchupId, voter: payload.voter, winnerId: payload.winnerId });
    renderBracket();
    showToast('Vote cast!');
  } catch (e) {
    showToast('Vote failed: ' + e.message, 'error');
    btn.disabled = false;
  }
}

// ─── Render: Final Poll ───────────────────────────────────────────────────────

function renderPoll(view) {
  const finalists = getFinalists();
  const [fA, fB] = finalists;
  const totalPoll = state.pollVotes.length;
  const aVotes = state.pollVotes.filter(v => String(v.airbnbId) === String(fA?.id)).length;
  const bVotes = state.pollVotes.filter(v => String(v.airbnbId) === String(fB?.id)).length;
  const userPoll = state.pollVotes.find(v => v.voter === state.currentUser);
  const pollWinner = totalPoll === CONFIG.TOTAL_VOTERS
    ? (aVotes >= bVotes ? fA : fB) : null;

  const pollSlot = (ab, votes) => {
    if (!ab) return '';
    const pct = totalPoll > 0 ? Math.round((votes / totalPoll) * 100) : 0;
    const voted = userPoll && String(userPoll.airbnbId) === String(ab.id);
    const canVote = state.currentUser && !pollWinner;
    return `
      <div class="poll-option ${pollWinner && pollWinner.id === ab.id ? 'poll-winner' : ''}">
        ${airbnbCard(ab)}
        <div class="poll-bar-wrap">
          <div class="poll-bar" style="width:${pct}%"></div>
        </div>
        <div class="poll-votes">${votes} / ${CONFIG.TOTAL_VOTERS} vote${votes !== 1 ? 's' : ''} (${pct}%)</div>
        ${canVote ? `<button class="btn btn-primary poll-vote-btn ${voted ? 'voted' : ''}"
          data-id="${ab.id}">${voted ? '✓ Your pick' : 'Choose this one'}</button>` : ''}
      </div>`;
  };

  view.innerHTML = `
    <div class="poll-header">
      <div class="poll-trophy">🏆</div>
      <h2>Final Vote</h2>
      <p>The bracket is decided — now pick your winner!</p>
    </div>
    <div class="poll-options">
      ${pollSlot(fA, aVotes)}
      <div class="poll-vs">vs</div>
      ${pollSlot(fB, bVotes)}
    </div>
    ${pollWinner ? `<div class="poll-result">🎉 The group chose: <strong>${pollWinner.name}</strong></div>` : ''}`;

  view.querySelectorAll('.poll-vote-btn').forEach(btn => {
    btn.addEventListener('click', () => handlePollVote(btn));
  });
}

async function handlePollVote(btn) {
  if (!state.currentUser) { showToast('Select your name first!', 'error'); return; }
  btn.disabled = true;
  try {
    const payload = { action: 'pollVote', voter: state.currentUser, airbnbId: Number(btn.dataset.id) };
    await api(payload);
    state.pollVotes = state.pollVotes.filter(v => v.voter !== state.currentUser);
    state.pollVotes.push({ voter: state.currentUser, airbnbId: payload.airbnbId });
    renderBracket();
    showToast('Poll vote cast!');
  } catch (e) {
    showToast('Vote failed: ' + e.message, 'error');
    btn.disabled = false;
  }
}

// ─── Render: Expenses ─────────────────────────────────────────────────────────

function renderExpenses() {
  renderExpenseSummary();
  renderExpenseList();
}

function renderExpenseSummary() {
  const { balance, settlements } = calcSettlements();
  const total = state.expenses.reduce((s, e) => s + Number(e.amount), 0);
  const el = document.getElementById('expensesSummary');

  const settlementsHtml = settlements.length
    ? settlements.map(s => `
        <div class="settlement-row">
          <span class="settlement-from">${s.from}</span>
          <span class="settlement-arrow">→</span>
          <span class="settlement-to">${s.to}</span>
          <span class="settlement-amt">${fmt$(s.amount)}</span>
        </div>`).join('')
    : '<p class="empty-note">All settled up!</p>';

  const balanceHtml = CONFIG.MEMBERS.map(m => {
    const val = balance[m] || 0;
    const cls = val > 0.005 ? 'bal-pos' : val < -0.005 ? 'bal-neg' : 'bal-zero';
    return `<div class="balance-row">
      <span>${m}</span>
      <span class="${cls}">${val >= 0 ? '+' : ''}${fmt$(val)}</span>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">Total Spent</div>
        <div class="summary-value">${fmt$(total)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Expenses</div>
        <div class="summary-value">${state.expenses.length}</div>
      </div>
    </div>
    <div class="summary-section">
      <h4>Balances</h4>
      <div class="balance-list">${balanceHtml}</div>
    </div>
    <div class="summary-section">
      <h4>Settlements</h4>
      ${settlementsHtml}
    </div>`;
}

function renderExpenseList() {
  const el = document.getElementById('expensesList');
  if (!state.expenses.length) {
    el.innerHTML = '<p class="empty-note">No expenses yet.</p>';
    return;
  }
  const sorted = [...state.expenses].reverse();
  el.innerHTML = sorted.map(exp => {
    const split = String(exp.splitAmong).split(',').map(s => s.trim()).filter(Boolean);
    return `
      <div class="expense-item">
        <div class="expense-main">
          <div class="expense-desc">${exp.description}</div>
          <div class="expense-amount">${fmt$(exp.amount)}</div>
        </div>
        <div class="expense-meta">
          Paid by <strong>${exp.paidBy}</strong> ·
          Split: ${split.join(', ')} ·
          ${exp.date}
        </div>
        ${state.currentUser ? `<button class="btn-icon delete-expense" data-id="${exp.id}" title="Delete">✕</button>` : ''}
      </div>`;
  }).join('');

  el.querySelectorAll('.delete-expense').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this expense?')) return;
      await api({ action: 'deleteExpense', id: btn.dataset.id });
      state.expenses = state.expenses.filter(e => e.id !== btn.dataset.id);
      renderExpenses();
      showToast('Expense deleted');
    });
  });
}

// ─── Render: All ─────────────────────────────────────────────────────────────

function renderAll() {
  renderTrip();
  renderBracket();
  renderExpenses();
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast toast-' + type;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('toast-hidden'), 2800);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {

  // Populate user selector
  const userSelect = document.getElementById('userSelect');
  CONFIG.MEMBERS.forEach(name => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = name;
    userSelect.appendChild(opt);
  });
  if (state.currentUser) userSelect.value = state.currentUser;

  userSelect.addEventListener('change', () => {
    state.currentUser = userSelect.value;
    localStorage.setItem('currentUser', state.currentUser);
    renderAll();
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // ── Add Event modal ──
  const addEventModal  = document.getElementById('addEventModal');
  const addEventForm   = document.getElementById('addEventForm');
  const paidBySelect   = document.getElementById('paidBySelect');
  const splitAmongGrp  = document.getElementById('splitAmongGroup');

  document.getElementById('addEventBtn').addEventListener('click', () => {
    if (!state.currentUser) { showToast('Select your name first!', 'error'); return; }
    addEventModal.classList.remove('hidden');
  });
  document.getElementById('cancelEventBtn').addEventListener('click', () => {
    addEventModal.classList.add('hidden');
    addEventForm.reset();
  });
  addEventModal.querySelector('.modal-backdrop').addEventListener('click', () => {
    addEventModal.classList.add('hidden');
    addEventForm.reset();
  });

  addEventForm.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(addEventForm);
    const payload = {
      action:      'addItinerary',
      date:        fd.get('date'),
      time:        fd.get('time') || '',
      title:       fd.get('title'),
      description: fd.get('description') || '',
      addedBy:     state.currentUser,
    };
    try {
      await api(payload);
      state.itinerary.push({ ...payload, id: Date.now().toString() });
      renderTrip();
      addEventModal.classList.add('hidden');
      addEventForm.reset();
      showToast('Event added!');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });

  // ── Add Expense modal ──
  const addExpenseModal = document.getElementById('addExpenseModal');
  const addExpenseForm  = document.getElementById('addExpenseForm');

  // Populate paid-by & split-among
  CONFIG.MEMBERS.forEach(name => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = name;
    paidBySelect.appendChild(opt);

    const label = document.createElement('label');
    label.className = 'checkbox-label';
    label.innerHTML = `<input type="checkbox" name="splitAmong" value="${name}" checked> ${name}`;
    splitAmongGrp.appendChild(label);
  });

  // Pre-select current user as payer when modal opens
  document.getElementById('addExpenseBtn').addEventListener('click', () => {
    if (!state.currentUser) { showToast('Select your name first!', 'error'); return; }
    paidBySelect.value = state.currentUser;
    // Default date to today
    const today = new Date().toISOString().split('T')[0];
    addExpenseForm.querySelector('[name="date"]').value = today;
    addExpenseModal.classList.remove('hidden');
  });
  document.getElementById('cancelExpenseBtn').addEventListener('click', () => {
    addExpenseModal.classList.add('hidden');
    addExpenseForm.reset();
  });
  addExpenseModal.querySelector('.modal-backdrop').addEventListener('click', () => {
    addExpenseModal.classList.add('hidden');
    addExpenseForm.reset();
  });

  document.getElementById('selectAllBtn').addEventListener('click', () => {
    splitAmongGrp.querySelectorAll('input').forEach(cb => cb.checked = true);
  });
  document.getElementById('selectNoneBtn').addEventListener('click', () => {
    splitAmongGrp.querySelectorAll('input').forEach(cb => cb.checked = false);
  });

  addExpenseForm.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(addExpenseForm);
    const splitAmong = [...addExpenseForm.querySelectorAll('[name="splitAmong"]:checked')]
      .map(cb => cb.value);
    if (!splitAmong.length) { showToast('Select at least one person to split with', 'error'); return; }

    const payload = {
      action:      'addExpense',
      description: fd.get('description'),
      amount:      Number(fd.get('amount')),
      paidBy:      fd.get('paidBy'),
      splitAmong,
      date:        fd.get('date'),
      addedBy:     state.currentUser,
    };
    try {
      await api(payload);
      state.expenses.push({ ...payload, id: Date.now().toString(), splitAmong: splitAmong.join(',') });
      renderExpenses();
      addExpenseModal.classList.add('hidden');
      addExpenseForm.reset();
      showToast('Expense added!');
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });

  // Load data from Google Sheets
  loadData();
});
