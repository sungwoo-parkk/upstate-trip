/* ═══════════════════════════════════════════════════════════════════════════
   Upstate NY Trip — Main App  (Firebase Firestore backend)
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── State ────────────────────────────────────────────────────────────────────

let state = {
  currentUser:    localStorage.getItem('currentUser') || '',
  votes:          [],
  pollVotes:      [],
  expenses:       [],
  itinerary:      [],
  airbnbs:        [],
  bracketStarted: false,
  polls:          [],
  pollOptions:    [],
  pollVotesCast:  [],
  estimates:      [],
};

// ─── Firebase ─────────────────────────────────────────────────────────────────

let db;

function initFirebase() {
  firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
  db = firebase.firestore();
}

// ─── API — maps action payloads to Firestore writes ───────────────────────────

async function api(payload) {
  switch (payload.action) {

    case 'vote':
      return db.collection('votes')
        .doc(`${payload.matchupId}__${payload.voter}`)
        .set({ matchupId: payload.matchupId, voter: payload.voter,
               winnerId: String(payload.winnerId), timestamp: new Date().toISOString() });

    case 'pollVote':
      return db.collection('pollVotes')
        .doc(payload.voter)
        .set({ voter: payload.voter, airbnbId: String(payload.airbnbId),
               timestamp: new Date().toISOString() });

    case 'addExpense':
      return db.collection('expenses').doc(payload._id).set({
        description: payload.description,
        amount:      Number(payload.amount),
        paidBy:      payload.paidBy,
        splitAmong:  Array.isArray(payload.splitAmong)
                       ? payload.splitAmong.join(',') : payload.splitAmong,
        date:        payload.date || new Date().toLocaleDateString('en-US'),
        addedBy:     payload.addedBy || '',
      });

    case 'deleteExpense':
      return db.collection('expenses').doc(String(payload.id)).delete();

    case 'addItinerary':
      return db.collection('itinerary').doc(payload._id).set({
        date:        payload.date,
        time:        payload.time || '',
        title:       payload.title,
        description: payload.description || '',
        addedBy:     payload.addedBy || '',
        timestamp:   new Date().toISOString(),
      });

    case 'deleteItinerary':
      return db.collection('itinerary').doc(String(payload.id)).delete();

    case 'addAirbnb':
      return db.collection('airbnbs').doc(payload._id).set({
        name:        payload.name || '',
        url:         payload.url,
        submittedBy: payload.submittedBy || '',
        timestamp:   new Date().toISOString(),
      });

    case 'deleteAirbnb':
      return db.collection('airbnbs').doc(String(payload.id)).delete();

    case 'startBracket':
      return db.collection('config').doc('bracketStarted').set({ value: 'true' });

    case 'resetBracket': {
      const batch = db.batch();
      const [vSnap, pvSnap] = await Promise.all([
        db.collection('votes').get(),
        db.collection('pollVotes').get(),
      ]);
      vSnap.docs.forEach(d  => batch.delete(d.ref));
      pvSnap.docs.forEach(d => batch.delete(d.ref));
      batch.set(db.collection('config').doc('bracketStarted'), { value: 'false' });
      return batch.commit();
    }

    case 'createPoll':
      return db.collection('polls').doc(payload._id).set({
        question:  payload.question,
        createdBy: payload.createdBy || '',
        timestamp: new Date().toISOString(),
      });

    case 'deletePoll': {
      const id    = String(payload.id);
      const batch = db.batch();
      batch.delete(db.collection('polls').doc(id));
      const [optsSnap, pvSnap] = await Promise.all([
        db.collection('pollOptions').where('pollId', '==', id).get(),
        db.collection('pollVotesCast').where('pollId', '==', id).get(),
      ]);
      optsSnap.docs.forEach(d => batch.delete(d.ref));
      pvSnap.docs.forEach(d   => batch.delete(d.ref));
      return batch.commit();
    }

    case 'addPollOption':
      return db.collection('pollOptions').doc(payload._id).set({
        pollId:    String(payload.pollId),
        title:     payload.title,
        url:       payload.url || '',
        addedBy:   payload.addedBy || '',
        timestamp: new Date().toISOString(),
      });

    case 'deletePollOption': {
      const id    = String(payload.id);
      const batch = db.batch();
      batch.delete(db.collection('pollOptions').doc(id));
      const votesSnap = await db.collection('pollVotesCast').where('optionId', '==', id).get();
      votesSnap.docs.forEach(d => batch.delete(d.ref));
      return batch.commit();
    }

    case 'togglePollVote': {
      const docId = `${payload.pollId}__${payload.optionId}__${payload.voter}`;
      const ref   = db.collection('pollVotesCast').doc(docId);
      const snap  = await ref.get();
      return snap.exists
        ? ref.delete()
        : ref.set({ pollId: String(payload.pollId), optionId: String(payload.optionId),
                    voter: payload.voter, timestamp: new Date().toISOString() });
    }

    case 'saveEstimate':
      return db.collection('estimates').doc(String(payload.airbnbId)).set({
        airbnbId:    String(payload.airbnbId),
        airbnbCost:  Number(payload.airbnbCost) || 0,
        food:        Number(payload.food)        || 0,
        transport:   Number(payload.transport)   || 0,
        activities:  Number(payload.activities)  || 0,
        numPeople:   Number(payload.numPeople)   || CONFIG.DEFAULT_PEOPLE,
        lastUpdatedBy: payload.lastUpdatedBy || '',
        timestamp:   new Date().toISOString(),
      });

    default:
      throw new Error('Unknown action: ' + payload.action);
  }
}

// ─── Data loading ─────────────────────────────────────────────────────────────

async function loadData() {
  try {
    const [vSnap, pvSnap, expSnap, itinSnap, abSnap, cfgSnap,
           pollsSnap, poSnap, pvcSnap, estSnap] = await Promise.all([
      db.collection('votes').get(),
      db.collection('pollVotes').get(),
      db.collection('expenses').get(),
      db.collection('itinerary').get(),
      db.collection('airbnbs').get(),
      db.collection('config').get(),
      db.collection('polls').get(),
      db.collection('pollOptions').get(),
      db.collection('pollVotesCast').get(),
      db.collection('estimates').get(),
    ]);

    state.votes         = vSnap.docs.map(d   => ({ id: d.id, ...d.data() }));
    state.pollVotes     = pvSnap.docs.map(d  => ({ id: d.id, ...d.data() }));
    state.expenses      = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.itinerary     = itinSnap.docs.map(d=> ({ id: d.id, ...d.data() }));
    state.airbnbs       = abSnap.docs.map(d  => ({ id: d.id, ...d.data() }));
    state.polls         = pollsSnap.docs.map(d=>({ id: d.id, ...d.data() }));
    state.pollOptions   = poSnap.docs.map(d  => ({ id: d.id, ...d.data() }));
    state.pollVotesCast = pvcSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.estimates     = estSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const bsDoc = cfgSnap.docs.find(d => d.id === 'bracketStarted');
    state.bracketStarted = bsDoc?.data()?.value === 'true';

    renderAll();
    setupListeners();
  } catch (e) {
    console.error('Load failed:', e);
    showToast('Failed to load data — check console', 'error');
  }
}

function setupListeners() {
  db.collection('votes').onSnapshot(snap => {
    state.votes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderBracket();
  });

  db.collection('pollVotes').onSnapshot(snap => {
    state.pollVotes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderBracket();
  });

  db.collection('expenses').onSnapshot(snap => {
    state.expenses = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderExpenses();
  });

  db.collection('itinerary').onSnapshot(snap => {
    state.itinerary = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderTrip();
  });

  db.collection('airbnbs').onSnapshot(snap => {
    state.airbnbs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderBracket();
    renderEstimates();
  });

  db.collection('config').onSnapshot(snap => {
    const bsDoc = snap.docs.find(d => d.id === 'bracketStarted');
    state.bracketStarted = bsDoc?.data()?.value === 'true';
    renderBracket();
  });

  db.collection('polls').onSnapshot(snap => {
    state.polls = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPolls();
  });

  db.collection('pollOptions').onSnapshot(snap => {
    state.pollOptions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPolls();
  });

  db.collection('pollVotesCast').onSnapshot(snap => {
    state.pollVotesCast = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderPolls();
  });

  db.collection('estimates').onSnapshot(snap => {
    state.estimates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderEstimates();
  });
}

// ─── Bracket helpers ──────────────────────────────────────────────────────────

function getBracketAirbnbs() {
  const count = state.airbnbs.length;
  if (count < 2) return [];
  const size = Math.pow(2, Math.floor(Math.log2(count)));
  return state.airbnbs.slice(0, size);
}

function nextBracketSize() {
  const count = state.airbnbs.length;
  for (const s of [4, 8, 16]) { if (s > count) return s; }
  return null;
}

function getVotesFor(matchupId) {
  return state.votes.filter(v => v.matchupId === matchupId);
}

function getMatchupResult(matchupId, aId, bId) {
  if (!aId || !bId) return { aVotes: 0, bVotes: 0, winner: null };
  const votes  = getVotesFor(matchupId);
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

function buildBracket() {
  const airbnbs     = getBracketAirbnbs();
  if (airbnbs.length < 2) return [];
  const totalRounds = Math.log2(airbnbs.length) - 1;
  const rounds      = [];

  const r1 = [];
  for (let i = 0; i < airbnbs.length; i += 2) {
    r1.push({ matchupId: `R1M${r1.length + 1}`, a: airbnbs[i], b: airbnbs[i + 1] });
  }
  rounds.push(r1);

  for (let r = 2; r <= totalRounds; r++) {
    const prev = rounds[r - 2];
    const next = [];
    for (let i = 0; i < prev.length; i += 2) {
      const mA   = prev[i];
      const mB   = prev[i + 1];
      const resA = getMatchupResult(mA.matchupId, mA.a?.id, mA.b?.id);
      const resB = getMatchupResult(mB.matchupId, mB.a?.id, mB.b?.id);
      const wA   = resA.winner ? state.airbnbs.find(x => String(x.id) === String(resA.winner)) : null;
      const wB   = resB.winner ? state.airbnbs.find(x => String(x.id) === String(resB.winner)) : null;
      next.push({ matchupId: `R${r}M${next.length + 1}`, a: wA, b: wB });
    }
    rounds.push(next);
  }
  return rounds;
}

function getFinalists() {
  const rounds = buildBracket();
  if (!rounds.length) return [null, null];
  const last = rounds[rounds.length - 1];
  return last.map(m => {
    if (!m.a || !m.b) return null;
    const res = getMatchupResult(m.matchupId, m.a.id, m.b.id);
    return res.winner ? state.airbnbs.find(x => String(x.id) === String(res.winner)) : null;
  });
}

function bracketComplete() {
  const [fA, fB] = getFinalists();
  return fA !== null && fB !== null;
}

// ─── Expense logic ────────────────────────────────────────────────────────────

function calcSettlements() {
  const balance = {};
  CONFIG.MEMBERS.forEach(m => balance[m] = 0);
  state.expenses.forEach(exp => {
    const amount     = Number(exp.amount);
    const paidBy     = exp.paidBy;
    const splitAmong = String(exp.splitAmong).split(',').map(s => s.trim()).filter(Boolean);
    if (!splitAmong.length) return;
    const share = amount / splitAmong.length;
    balance[paidBy] = (balance[paidBy] || 0) + amount;
    splitAmong.forEach(p => balance[p] = (balance[p] || 0) - share);
  });
  const debtors   = Object.entries(balance).filter(([, v]) => v < -0.005).map(([n, v]) => ({ name: n, amount: -v }));
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
      : `<p class="empty-note">No events yet. Add one!</p>`;
    return `
      <div class="day-card">
        <h3 class="day-label">${label}</h3>
        <div class="itinerary-list">${itemsHtml}</div>
      </div>`;
  }).join('');

  container.querySelectorAll('.delete-event').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Delete this event?')) return;
      const prev = [...state.itinerary];
      state.itinerary = state.itinerary.filter(e => e.id !== btn.dataset.id);
      renderTrip();
      showToast('Event deleted');
      api({ action: 'deleteItinerary', id: btn.dataset.id })
        .catch(() => { state.itinerary = prev; renderTrip(); showToast('Delete failed — rolled back', 'error'); });
    });
  });
}

// ─── Render: Bracket (dispatcher) ────────────────────────────────────────────

function renderBracket() {
  const view = document.getElementById('bracket-view');
  if (!state.bracketStarted) {
    renderSubmissionPhase(view);
  } else if (bracketComplete()) {
    renderPoll(view);
  } else {
    renderKnockoutBracket(view);
  }
}

// ─── Render: Submission phase ─────────────────────────────────────────────────

function renderSubmissionPhase(view) {
  const count       = state.airbnbs.length;
  const bracketSize = count >= 2 ? Math.pow(2, Math.floor(Math.log2(count))) : 0;
  const next        = nextBracketSize();
  const canStart    = bracketSize >= 2;

  const hintParts = [];
  if (canStart) hintParts.push(`Ready for a <strong>${bracketSize}-listing bracket</strong>`);
  if (next)     hintParts.push(`add ${next - count} more for ${next}`);
  const hint = hintParts.join(' · ');

  const listingsHtml = state.airbnbs.length
    ? state.airbnbs.map((ab, i) => `
        <div class="submission-item ${i >= bracketSize ? 'submission-overflow' : ''}">
          <div class="submission-num">${i + 1}</div>
          <div class="submission-body">
            <div class="submission-name">${ab.name || 'Listing #' + (i + 1)}</div>
            <a href="${ab.url}" target="_blank" class="submission-url">${ab.url}</a>
            <div class="submission-meta">Added by ${ab.submittedBy || 'unknown'}</div>
          </div>
          ${state.currentUser ? `<button class="btn-icon delete-airbnb" data-id="${ab.id}" title="Remove">✕</button>` : ''}
          ${i >= bracketSize && bracketSize > 0 ? `<span class="overflow-tag">won't be seeded</span>` : ''}
        </div>`).join('')
    : `<p class="empty-note">No listings yet — be the first to submit one!</p>`;

  view.innerHTML = `
    <div class="submission-phase">
      <div class="submission-header">
        <div>
          <h2>AirBnb Listings</h2>
          <p class="submission-hint">${count} submitted${hint ? ' · ' + hint : ''}</p>
        </div>
        ${state.currentUser
          ? `<button class="btn btn-primary" id="submitAirbnbBtn">+ Submit Listing</button>`
          : `<p class="no-user-note">Select your name to submit</p>`}
      </div>

      <div class="submission-list">${listingsHtml}</div>

      ${canStart && state.currentUser ? `
        <div class="start-bracket-wrap">
          <button class="btn btn-start" id="startBracketBtn">
            🏆 Lock &amp; Start ${bracketSize}-Listing Bracket
          </button>
          ${count > bracketSize
            ? `<p class="start-note">The first ${bracketSize} submissions will be seeded (the rest are excluded).</p>`
            : ''}
        </div>` : ''}
    </div>`;

  view.querySelectorAll('.delete-airbnb').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Remove this listing?')) return;
      const prev = [...state.airbnbs];
      state.airbnbs = state.airbnbs.filter(a => a.id !== btn.dataset.id);
      renderBracket();
      showToast('Listing removed');
      api({ action: 'deleteAirbnb', id: btn.dataset.id })
        .catch(() => { state.airbnbs = prev; renderBracket(); showToast('Delete failed — rolled back', 'error'); });
    });
  });

  const startBtn = view.querySelector('#startBracketBtn');
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      if (!confirm(`Lock submissions and start the ${bracketSize}-listing bracket? This can't be undone.`)) return;
      startBtn.disabled = true;
      try {
        await api({ action: 'startBracket' });
        state.bracketStarted = true;
        renderBracket();
        showToast('Bracket started! Time to vote 🏆');
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
        startBtn.disabled = false;
      }
    });
  }

  const submitBtn = view.querySelector('#submitAirbnbBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      document.getElementById('addAirbnbModal').classList.remove('hidden');
    });
  }
}

// ─── Render: Knockout bracket ─────────────────────────────────────────────────

function renderKnockoutBracket(view) {
  const rounds      = buildBracket();
  const roundLabels = rounds.map((_, i) => `Round ${i + 1}`);

  const bracketHtml = rounds.map((matchups, ri) => `
    <div class="bracket-round">
      <div class="round-label">${roundLabels[ri]}</div>
      <div class="matchups">${matchups.map(m => renderMatchup(m)).join('')}</div>
    </div>`).join('');

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

function renderMatchup(m) {
  const locked = !m.a || !m.b;
  if (locked) return `
    <div class="matchup matchup-locked">
      <div class="matchup-slot slot-tbd">TBD</div>
      <div class="matchup-vs">vs</div>
      <div class="matchup-slot slot-tbd">TBD</div>
    </div>`;

  const { aVotes, bVotes, winner } = getMatchupResult(m.matchupId, m.a.id, m.b.id);
  const total    = aVotes + bVotes;
  const decided  = winner !== null;
  const userVote = state.votes.find(
    v => v.matchupId === m.matchupId && v.voter === state.currentUser
  );

  const slotHtml = (ab, voteCount, isWinner) => {
    const pct    = total > 0 ? Math.round((voteCount / total) * 100) : 0;
    const canVote = state.currentUser && !decided;
    const voted   = userVote && String(userVote.winnerId) === String(ab.id);
    return `
      <div class="matchup-slot ${isWinner ? 'slot-winner' : ''} ${decided && !isWinner ? 'slot-loser' : ''}">
        <div class="slot-name">
          ${ab.name || 'Option ' + ab.id}
          ${ab.url ? `<a href="${ab.url}" target="_blank" class="slot-link">↗</a>` : ''}
        </div>
        <div class="slot-bar-wrap"><div class="slot-bar" style="width:${pct}%"></div></div>
        <div class="slot-votes">${voteCount} vote${voteCount !== 1 ? 's' : ''}</div>
        ${canVote ? `<button class="vote-btn ${voted ? 'voted' : ''}"
          data-matchup="${m.matchupId}" data-winner="${ab.id}">${voted ? '✓ Voted' : 'Vote'}</button>` : ''}
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
  if (!state.currentUser) { showToast('Select your name first!', 'error'); return; }
  const payload = { action: 'vote', matchupId: btn.dataset.matchup, voter: state.currentUser, winnerId: btn.dataset.winner };
  const prev = [...state.votes];
  state.votes = state.votes.filter(v => !(v.matchupId === payload.matchupId && v.voter === payload.voter));
  state.votes.push(payload);
  renderBracket();
  showToast('Vote cast!');
  api(payload).catch(() => { state.votes = prev; renderBracket(); showToast('Vote failed — rolled back', 'error'); });
}

// ─── Render: Final Poll ───────────────────────────────────────────────────────

function renderPoll(view) {
  const [fA, fB]   = getFinalists();
  const totalPoll  = state.pollVotes.length;
  const aVotes     = state.pollVotes.filter(v => String(v.airbnbId) === String(fA?.id)).length;
  const bVotes     = state.pollVotes.filter(v => String(v.airbnbId) === String(fB?.id)).length;
  const userPoll   = state.pollVotes.find(v => v.voter === state.currentUser);
  const pollWinner = totalPoll === CONFIG.TOTAL_VOTERS
    ? (aVotes >= bVotes ? fA : fB) : null;

  const pollSlot = (ab, votes) => {
    if (!ab) return '';
    const pct     = totalPoll > 0 ? Math.round((votes / totalPoll) * 100) : 0;
    const voted   = userPoll && String(userPoll.airbnbId) === String(ab.id);
    const canVote = state.currentUser && !pollWinner;
    return `
      <div class="poll-option ${pollWinner?.id === ab.id ? 'poll-winner' : ''}">
        <div class="poll-listing-name">${ab.name || 'Listing #' + ab.id}</div>
        ${ab.url ? `<a href="${ab.url}" target="_blank" class="ab-link">View listing ↗</a>` : ''}
        <div class="poll-bar-wrap"><div class="poll-bar" style="width:${pct}%"></div></div>
        <div class="poll-votes">${votes} / ${CONFIG.TOTAL_VOTERS} votes (${pct}%)</div>
        ${canVote ? `<button class="btn btn-primary poll-vote-btn ${voted ? 'voted' : ''}"
          data-id="${ab.id}">${voted ? '✓ Your pick' : 'Choose this one'}</button>` : ''}
      </div>`;
  };

  view.innerHTML = `
    <div class="poll-header">
      <div class="poll-trophy">🏆</div>
      <h2>Final Vote</h2>
      <p>Two finalists remain — pick your winner!</p>
    </div>
    <div class="poll-options">
      ${pollSlot(fA, aVotes)}
      <div class="poll-vs">vs</div>
      ${pollSlot(fB, bVotes)}
    </div>
    ${pollWinner ? `<div class="poll-result">🎉 The group chose: <strong>${pollWinner.name || 'Listing #' + pollWinner.id}</strong></div>` : ''}`;

  view.querySelectorAll('.poll-vote-btn').forEach(btn => {
    btn.addEventListener('click', () => handlePollVote(btn));
  });
}

async function handlePollVote(btn) {
  if (!state.currentUser) { showToast('Select your name first!', 'error'); return; }
  const payload = { action: 'pollVote', voter: state.currentUser, airbnbId: btn.dataset.id };
  const prev = [...state.pollVotes];
  state.pollVotes = state.pollVotes.filter(v => v.voter !== state.currentUser);
  state.pollVotes.push({ voter: state.currentUser, airbnbId: payload.airbnbId });
  renderBracket();
  showToast('Vote cast!');
  api(payload).catch(() => { state.pollVotes = prev; renderBracket(); showToast('Vote failed — rolled back', 'error'); });
}

// ─── Render: Expenses ─────────────────────────────────────────────────────────

function renderExpenses() {
  renderExpenseSummary();
  renderExpenseList();
}

function renderExpenseSummary() {
  const { balance, settlements } = calcSettlements();
  const total = state.expenses.reduce((s, e) => s + Number(e.amount), 0);
  const el    = document.getElementById('expensesSummary');

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
  if (!state.expenses.length) { el.innerHTML = '<p class="empty-note">No expenses yet.</p>'; return; }
  el.innerHTML = [...state.expenses].reverse().map(exp => {
    const split = String(exp.splitAmong).split(',').map(s => s.trim()).filter(Boolean);
    return `
      <div class="expense-item">
        <div class="expense-main">
          <div class="expense-desc">${exp.description}</div>
          <div class="expense-amount">${fmt$(exp.amount)}</div>
        </div>
        <div class="expense-meta">
          Paid by <strong>${exp.paidBy}</strong> · Split: ${split.join(', ')} · ${exp.date}
        </div>
        ${state.currentUser ? `<button class="btn-icon delete-expense" data-id="${exp.id}" title="Delete">✕</button>` : ''}
      </div>`;
  }).join('');

  el.querySelectorAll('.delete-expense').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Delete this expense?')) return;
      const prev = [...state.expenses];
      state.expenses = state.expenses.filter(e => e.id !== btn.dataset.id);
      renderExpenses();
      showToast('Expense deleted');
      api({ action: 'deleteExpense', id: btn.dataset.id })
        .catch(() => { state.expenses = prev; renderExpenses(); showToast('Delete failed — rolled back', 'error'); });
    });
  });
}

// ─── Render: Polls ────────────────────────────────────────────────────────────

function renderPolls() {
  const container = document.getElementById('polls-container');
  if (!container) return;

  if (!state.polls.length) {
    container.innerHTML = '<p class="empty-note">No polls yet — create one!</p>';
    return;
  }

  const sorted = [...state.polls].sort((a, b) => String(b.id).localeCompare(String(a.id)));

  container.innerHTML = sorted.map(poll => {
    const options     = state.pollOptions.filter(o => String(o.pollId) === String(poll.id));
    const totalVoters = new Set(
      state.pollVotesCast.filter(v => String(v.pollId) === String(poll.id)).map(v => v.voter)
    ).size;

    const optionsHtml = options.length
      ? options.map(opt => {
          const voteCount = state.pollVotesCast.filter(
            v => String(v.pollId) === String(poll.id) && String(v.optionId) === String(opt.id)
          ).length;
          const userVoted = state.pollVotesCast.some(
            v => String(v.pollId)   === String(poll.id) &&
                 String(v.optionId) === String(opt.id) &&
                 v.voter === state.currentUser
          );
          const pct = totalVoters > 0 ? Math.round((voteCount / totalVoters) * 100) : 0;

          return `
            <div class="poll-opt-row">
              <button class="poll-opt-vote ${userVoted ? 'poll-opt-voted' : ''} ${!state.currentUser ? 'poll-opt-disabled' : ''}"
                data-poll="${poll.id}" data-option="${opt.id}"
                ${!state.currentUser ? 'disabled title="Select your name first"' : ''}>
                ${userVoted ? '✓' : '○'}
              </button>
              <div class="poll-opt-body">
                <div class="poll-opt-title">
                  ${opt.title}
                  ${opt.url ? `<a href="${opt.url}" target="_blank" class="poll-opt-link">↗</a>` : ''}
                </div>
                <div class="poll-opt-bar-wrap">
                  <div class="poll-opt-bar" style="width:${pct}%"></div>
                </div>
              </div>
              <div class="poll-opt-count">${voteCount}</div>
              ${state.currentUser ? `<button class="btn-icon delete-poll-opt" data-id="${opt.id}" data-poll="${poll.id}" title="Remove option">✕</button>` : ''}
            </div>`;
        }).join('')
      : `<p class="empty-note" style="margin:0 0 12px">No options yet — add one below.</p>`;

    return `
      <div class="poll-card" data-poll-id="${poll.id}">
        <div class="poll-card-header">
          <div>
            <div class="poll-question">${poll.question}</div>
            <div class="poll-meta">Created by ${poll.createdBy || 'unknown'} · ${totalVoters} voter${totalVoters !== 1 ? 's' : ''}</div>
          </div>
          ${state.currentUser ? `<button class="btn-icon delete-poll" data-id="${poll.id}" title="Delete poll">🗑️</button>` : ''}
        </div>
        <div class="poll-options-list">${optionsHtml}</div>
        ${state.currentUser ? `
          <button class="btn btn-sm btn-ghost add-opt-btn" data-poll="${poll.id}">+ Add Option</button>
        ` : ''}
      </div>`;
  }).join('');

  container.querySelectorAll('.poll-opt-vote').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.currentUser) return;
      const pollId   = btn.dataset.poll;
      const optionId = btn.dataset.option;
      const key      = v => String(v.pollId) === String(pollId) && String(v.optionId) === String(optionId) && v.voter === state.currentUser;
      const prev     = [...state.pollVotesCast];
      if (state.pollVotesCast.some(key)) state.pollVotesCast = state.pollVotesCast.filter(v => !key(v));
      else state.pollVotesCast.push({ pollId, optionId, voter: state.currentUser });
      renderPolls();
      api({ action: 'togglePollVote', pollId, optionId, voter: state.currentUser })
        .catch(() => { state.pollVotesCast = prev; renderPolls(); showToast('Vote failed — rolled back', 'error'); });
    });
  });

  container.querySelectorAll('.delete-poll').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Delete this entire poll and all its votes?')) return;
      const id = btn.dataset.id;
      const prev = { polls: [...state.polls], opts: [...state.pollOptions], votes: [...state.pollVotesCast] };
      state.polls         = state.polls.filter(p => String(p.id) !== String(id));
      state.pollOptions   = state.pollOptions.filter(o => String(o.pollId) !== String(id));
      state.pollVotesCast = state.pollVotesCast.filter(v => String(v.pollId) !== String(id));
      renderPolls();
      showToast('Poll deleted');
      api({ action: 'deletePoll', id }).catch(() => {
        state.polls = prev.polls; state.pollOptions = prev.opts; state.pollVotesCast = prev.votes;
        renderPolls(); showToast('Delete failed — rolled back', 'error');
      });
    });
  });

  container.querySelectorAll('.delete-poll-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Remove this option?')) return;
      const id = btn.dataset.id;
      const prev = { opts: [...state.pollOptions], votes: [...state.pollVotesCast] };
      state.pollOptions   = state.pollOptions.filter(o => String(o.id) !== String(id));
      state.pollVotesCast = state.pollVotesCast.filter(v => String(v.optionId) !== String(id));
      renderPolls();
      showToast('Option removed');
      api({ action: 'deletePollOption', id }).catch(() => {
        state.pollOptions = prev.opts; state.pollVotesCast = prev.votes;
        renderPolls(); showToast('Delete failed — rolled back', 'error');
      });
    });
  });

  container.querySelectorAll('.add-opt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelector('#addOptionForm [name="pollId"]').value = btn.dataset.poll;
      document.getElementById('addOptionModal').classList.remove('hidden');
    });
  });
}

// ─── Render: Budget Estimates ─────────────────────────────────────────────────

function renderEstimates() {
  const container = document.getElementById('estimates-container');
  if (!container) return;

  if (!state.airbnbs.length) {
    container.innerHTML = '<p class="empty-note">No AirBnb listings yet — add some in the AirBnb Vote tab first.</p>';
    return;
  }

  container.innerHTML = state.airbnbs.map(ab => {
    const est        = state.estimates.find(e => String(e.airbnbId) === String(ab.id)) || {};
    const airbnbCost = Number(est.airbnbCost) || 0;
    const food       = Number(est.food)       || 0;
    const transport  = Number(est.transport)  || 0;
    const activities = Number(est.activities) || 0;
    const numPeople  = Number(est.numPeople)  || CONFIG.DEFAULT_PEOPLE;
    const total      = airbnbCost + food + transport + activities;
    const perPerson  = numPeople > 0 ? total / numPeople : 0;

    return `
      <div class="estimate-card" data-airbnb-id="${ab.id}">
        <div class="estimate-header">
          <div class="estimate-title-group">
            <div class="estimate-name">${ab.name || 'Listing #' + ab.id}</div>
            ${ab.url ? `<a href="${ab.url}" target="_blank" class="estimate-link">View listing ↗</a>` : ''}
          </div>
          ${est.lastUpdatedBy ? `<div class="estimate-meta">Updated by ${est.lastUpdatedBy}</div>` : ''}
        </div>
        <div class="estimate-fields">
          <div class="estimate-field">
            <label class="est-label">AirBnb ($)</label>
            <input type="number" class="est-input" data-field="airbnbCost"
              value="${airbnbCost || ''}" placeholder="0" min="0" step="1">
          </div>
          <div class="estimate-field">
            <label class="est-label">Food ($)</label>
            <input type="number" class="est-input" data-field="food"
              value="${food || ''}" placeholder="0" min="0" step="1">
          </div>
          <div class="estimate-field">
            <label class="est-label">Transport ($)</label>
            <input type="number" class="est-input" data-field="transport"
              value="${transport || ''}" placeholder="0" min="0" step="1">
          </div>
          <div class="estimate-field">
            <label class="est-label">Activities ($)</label>
            <input type="number" class="est-input" data-field="activities"
              value="${activities || ''}" placeholder="0" min="0" step="1">
          </div>
          <div class="estimate-field estimate-field-people">
            <label class="est-label"># People</label>
            <input type="number" class="est-input" data-field="numPeople"
              value="${numPeople}" placeholder="${CONFIG.DEFAULT_PEOPLE}" min="1" step="1">
          </div>
        </div>
        <div class="estimate-totals">
          <div class="est-total-row">
            <span class="est-total-label">Total</span>
            <span class="est-total-val">${fmt$(total)}</span>
          </div>
          <div class="est-per-row">
            <span class="est-per-label">Per Person (÷${numPeople})</span>
            <span class="est-per-val">${fmt$(perPerson)}</span>
          </div>
        </div>
        ${state.currentUser
          ? `<button class="btn btn-primary est-save-btn" data-airbnb-id="${ab.id}">Save Estimates</button>`
          : `<p class="est-login-note">Select your name above to save estimates</p>`}
      </div>`;
  }).join('');

  container.querySelectorAll('.estimate-card').forEach(card => {
    card.querySelectorAll('.est-input').forEach(inp => {
      inp.addEventListener('input', () => updateEstimateTotals(card));
    });
  });

  container.querySelectorAll('.est-save-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!state.currentUser) { showToast('Select your name first!', 'error'); return; }
      const card      = btn.closest('.estimate-card');
      const airbnbId  = btn.dataset.airbnbId;
      const getVal    = f => Number(card.querySelector(`[data-field="${f}"]`)?.value) || 0;
      const numPeople = Number(card.querySelector('[data-field="numPeople"]')?.value) || CONFIG.DEFAULT_PEOPLE;

      btn.disabled    = true;
      btn.textContent = 'Saving…';
      try {
        await api({
          action: 'saveEstimate', airbnbId,
          airbnbCost: getVal('airbnbCost'),
          food:       getVal('food'),
          transport:  getVal('transport'),
          activities: getVal('activities'),
          numPeople,
          lastUpdatedBy: state.currentUser,
        });
        showToast('Estimates saved!');
      } catch (e) {
        showToast('Save failed: ' + e.message, 'error');
      } finally {
        btn.disabled    = false;
        btn.textContent = 'Save Estimates';
      }
    });
  });
}

function updateEstimateTotals(card) {
  const getVal     = f => Number(card.querySelector(`[data-field="${f}"]`)?.value) || 0;
  const numPeople  = Number(card.querySelector('[data-field="numPeople"]')?.value) || CONFIG.DEFAULT_PEOPLE;
  const total      = getVal('airbnbCost') + getVal('food') + getVal('transport') + getVal('activities');
  const perPerson  = numPeople > 0 ? total / numPeople : 0;
  card.querySelector('.est-total-val').textContent = fmt$(total);
  card.querySelector('.est-per-val').textContent   = fmt$(perPerson);
  card.querySelector('.est-per-label').textContent  = `Per Person (÷${numPeople})`;
}

// ─── Render: All ─────────────────────────────────────────────────────────────

function renderAll() {
  renderTrip();
  renderBracket();
  renderPolls();
  renderExpenses();
  renderEstimates();
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
  initFirebase();

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

  // ── Add Event modal ──────────────────────────────────────────────────────
  const addEventModal = document.getElementById('addEventModal');
  const addEventForm  = document.getElementById('addEventForm');

  document.getElementById('addEventBtn').addEventListener('click', () => {
    if (!state.currentUser) { showToast('Select your name first!', 'error'); return; }
    addEventModal.classList.remove('hidden');
  });
  document.getElementById('cancelEventBtn').addEventListener('click', () => {
    addEventModal.classList.add('hidden'); addEventForm.reset();
  });
  addEventModal.querySelector('.modal-backdrop').addEventListener('click', () => {
    addEventModal.classList.add('hidden'); addEventForm.reset();
  });
  addEventForm.addEventListener('submit', e => {
    e.preventDefault();
    const fd  = new FormData(addEventForm);
    const _id = Date.now().toString();
    const payload = { action: 'addItinerary', _id, date: fd.get('date'), time: fd.get('time') || '',
                      title: fd.get('title'), description: fd.get('description') || '', addedBy: state.currentUser };
    const item = { ...payload, id: _id };
    state.itinerary.push(item);
    renderTrip();
    addEventModal.classList.add('hidden'); addEventForm.reset();
    showToast('Event added!');
    api(payload).catch(() => { state.itinerary = state.itinerary.filter(e => e.id !== _id); renderTrip(); showToast('Save failed — rolled back', 'error'); });
  });

  // ── Create Poll modal ────────────────────────────────────────────────────
  const createPollModal = document.getElementById('createPollModal');
  const createPollForm  = document.getElementById('createPollForm');

  document.getElementById('createPollBtn').addEventListener('click', () => {
    if (!state.currentUser) { showToast('Select your name first!', 'error'); return; }
    createPollModal.classList.remove('hidden');
  });
  document.getElementById('cancelPollBtn').addEventListener('click', () => {
    createPollModal.classList.add('hidden'); createPollForm.reset();
  });
  createPollModal.querySelector('.modal-backdrop').addEventListener('click', () => {
    createPollModal.classList.add('hidden'); createPollForm.reset();
  });
  createPollForm.addEventListener('submit', e => {
    e.preventDefault();
    const question = new FormData(createPollForm).get('question').trim();
    if (!question) return;
    const _id  = Date.now().toString();
    const poll = { id: _id, question, createdBy: state.currentUser };
    state.polls.push(poll);
    renderPolls();
    createPollModal.classList.add('hidden'); createPollForm.reset();
    showToast('Poll created!');
    api({ action: 'createPoll', _id, question, createdBy: state.currentUser })
      .catch(() => { state.polls = state.polls.filter(p => p.id !== _id); renderPolls(); showToast('Save failed — rolled back', 'error'); });
  });

  // ── Add Poll Option modal ─────────────────────────────────────────────────
  const addOptionModal = document.getElementById('addOptionModal');
  const addOptionForm  = document.getElementById('addOptionForm');

  document.getElementById('cancelOptionBtn').addEventListener('click', () => {
    addOptionModal.classList.add('hidden'); addOptionForm.reset();
  });
  addOptionModal.querySelector('.modal-backdrop').addEventListener('click', () => {
    addOptionModal.classList.add('hidden'); addOptionForm.reset();
  });
  addOptionForm.addEventListener('submit', e => {
    e.preventDefault();
    const fd     = new FormData(addOptionForm);
    const pollId = fd.get('pollId');
    const title  = fd.get('title').trim();
    const url    = fd.get('url').trim();
    if (!title) return;
    const _id = Date.now().toString();
    const opt = { id: _id, pollId, title, url, addedBy: state.currentUser };
    state.pollOptions.push(opt);
    renderPolls();
    addOptionModal.classList.add('hidden'); addOptionForm.reset();
    showToast('Option added!');
    api({ action: 'addPollOption', _id, pollId, title, url, addedBy: state.currentUser })
      .catch(() => { state.pollOptions = state.pollOptions.filter(o => o.id !== _id); renderPolls(); showToast('Save failed — rolled back', 'error'); });
  });

  // ── Add AirBnb modal ─────────────────────────────────────────────────────
  const addAirbnbModal = document.getElementById('addAirbnbModal');
  const addAirbnbForm  = document.getElementById('addAirbnbForm');

  document.addEventListener('click', e => {
    if (e.target.id === 'submitAirbnbBtn') {
      if (!state.currentUser) { showToast('Select your name first!', 'error'); return; }
      addAirbnbModal.classList.remove('hidden');
    }
  });
  document.getElementById('cancelAirbnbBtn').addEventListener('click', () => {
    addAirbnbModal.classList.add('hidden'); addAirbnbForm.reset();
  });
  addAirbnbModal.querySelector('.modal-backdrop').addEventListener('click', () => {
    addAirbnbModal.classList.add('hidden'); addAirbnbForm.reset();
  });
  addAirbnbForm.addEventListener('submit', e => {
    e.preventDefault();
    const fd   = new FormData(addAirbnbForm);
    const url  = fd.get('url').trim();
    const name = fd.get('name').trim();
    if (!url) { showToast('URL is required', 'error'); return; }
    const _id     = Date.now().toString();
    const listing = { id: _id, url, name, submittedBy: state.currentUser };
    state.airbnbs.push(listing);
    renderBracket();
    addAirbnbModal.classList.add('hidden'); addAirbnbForm.reset();
    showToast('Listing submitted!');
    api({ action: 'addAirbnb', _id, url, name, submittedBy: state.currentUser })
      .catch(() => { state.airbnbs = state.airbnbs.filter(a => a.id !== _id); renderBracket(); showToast('Save failed — rolled back', 'error'); });
  });

  // ── Add Expense modal ────────────────────────────────────────────────────
  const addExpenseModal = document.getElementById('addExpenseModal');
  const addExpenseForm  = document.getElementById('addExpenseForm');
  const paidBySelect    = document.getElementById('paidBySelect');
  const splitAmongGrp   = document.getElementById('splitAmongGroup');

  CONFIG.MEMBERS.forEach(name => {
    const opt = document.createElement('option');
    opt.value = opt.textContent = name;
    paidBySelect.appendChild(opt);

    const label = document.createElement('label');
    label.className = 'checkbox-label';
    label.innerHTML = `<input type="checkbox" name="splitAmong" value="${name}" checked> ${name}`;
    splitAmongGrp.appendChild(label);
  });

  document.getElementById('addExpenseBtn').addEventListener('click', () => {
    if (!state.currentUser) { showToast('Select your name first!', 'error'); return; }
    paidBySelect.value = state.currentUser;
    addExpenseForm.querySelector('[name="date"]').value = new Date().toISOString().split('T')[0];
    addExpenseModal.classList.remove('hidden');
  });
  document.getElementById('cancelExpenseBtn').addEventListener('click', () => {
    addExpenseModal.classList.add('hidden'); addExpenseForm.reset();
  });
  addExpenseModal.querySelector('.modal-backdrop').addEventListener('click', () => {
    addExpenseModal.classList.add('hidden'); addExpenseForm.reset();
  });
  document.getElementById('selectAllBtn').addEventListener('click', () => {
    splitAmongGrp.querySelectorAll('input').forEach(cb => cb.checked = true);
  });
  document.getElementById('selectNoneBtn').addEventListener('click', () => {
    splitAmongGrp.querySelectorAll('input').forEach(cb => cb.checked = false);
  });
  addExpenseForm.addEventListener('submit', e => {
    e.preventDefault();
    const fd         = new FormData(addExpenseForm);
    const splitAmong = [...addExpenseForm.querySelectorAll('[name="splitAmong"]:checked')].map(cb => cb.value);
    if (!splitAmong.length) { showToast('Select at least one person to split with', 'error'); return; }
    const _id    = Date.now().toString();
    const payload = { action: 'addExpense', _id, description: fd.get('description'),
                      amount: Number(fd.get('amount')), paidBy: fd.get('paidBy'),
                      splitAmong, date: fd.get('date'), addedBy: state.currentUser };
    const expense = { ...payload, id: _id, splitAmong: splitAmong.join(',') };
    state.expenses.push(expense);
    renderExpenses();
    addExpenseModal.classList.add('hidden'); addExpenseForm.reset();
    showToast('Expense added!');
    api(payload).catch(() => { state.expenses = state.expenses.filter(ex => ex.id !== _id); renderExpenses(); showToast('Save failed — rolled back', 'error'); });
  });

  loadData();
});
