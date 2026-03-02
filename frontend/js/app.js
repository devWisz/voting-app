
const State = {
  candidates:  [],
  voterCount:  0,
  selectedPDA: null,
  voterPDA:    null,
  hasVoted:    false,
  pollTimer:   null,
};


window.addEventListener('DOMContentLoaded', async () => {
  solana_init();
  renderWalletOff();

  // Auto-connect if Phantom was previously approved
  if (window.solana?.isConnected) {
    try { await _doConnect(true); } catch { /* not yet trusted */ }
  }
});

/* ── WALLET ──────────────────────────────────────────────────── */
async function onConnectWallet() {
  try {
    await _doConnect(false);
  } catch (e) {
    if (!e.message?.includes('User rejected')) {
      toast('Connection failed', e.message, 'error');
    }
  }
}

async function _doConnect(silent) {
  const pubkey = await connectWallet(silent);
  renderWalletOn(pubkey);
  toast('Wallet connected', shortKey(pubkey), 'success');
  await loadCandidates();
  _startPoll();
}

/* ── POLLING ─────────────────────────────────────────────────── */
function _startPoll() {
  clearInterval(State.pollTimer);
  State.pollTimer = setInterval(loadCandidates, CFG.POLL_MS);
}

/* ── LOAD CANDIDATES FROM CHAIN ──────────────────────────────── */
async function loadCandidates() {
  try {
    const raw = await fetchAccountsBySize(CFG.CANDIDATE_SIZE);
    State.candidates = raw
      .map(({ pubkey, account }) => {
        try { return parseCandidate(pubkey.toString(), account.data); }
        catch { return null; }
      })
      .filter(Boolean);

    // Count voter accounts (best-effort, non-critical)
    try {
      const voters = await fetchAccountsBySize(CFG.VOTER_SIZE);
      State.voterCount = voters.length;
    } catch { /* ignore */ }

    updateStats(State.candidates, State.voterCount);
    renderCandidates(State.candidates, State.selectedPDA, selectCandidate);
  } catch (e) {
    console.warn('[loadCandidates]', e.message);
  }
}


function selectCandidate(pda) {
  State.selectedPDA = pda;
  renderCandidates(State.candidates, State.selectedPDA, selectCandidate);
  el('btn-cast-vote').disabled = State.hasVoted || !State.voterPDA;
}


async function onRegisterCandidate() {
  if (!isWalletConnected()) { toast('Connect wallet first', '', 'warning'); return; }

  const cName    = getVal('inp-cname');
  const partyName = getVal('inp-party');

  if (!cName || !partyName) { toast('Fill in both fields', '', 'warning'); return; }
  if (cName.length > CFG.MAX_NAME || partyName.length > CFG.MAX_NAME) {
    toast(`Max ${CFG.MAX_NAME} characters each`, '', 'warning'); return;
  }

  const ID = 'btn-reg-candidate';
  setBtn(ID, true, 'Register Candidate');
  try {
    const wallet = getWallet();
    const pda    = await findCandidatePDA(cName, wallet);
    const ix     = await buildRegisterCandidateIx(wallet, pda, cName, partyName);
    const sig    = await sendAndConfirm(ix);

    // Optimistic local update — don't wait for next poll
    State.candidates.push({ pda: pda.toString(), name: cName, party: partyName, votes: 0 });
    updateStats(State.candidates, State.voterCount);
    renderCandidates(State.candidates, State.selectedPDA, selectCandidate);

    logTx(`Registered candidate: ${cName}`, sig);
    toast('Candidate registered!', `${cName} · ${partyName}`, 'success');
    clearVal('inp-cname');
    clearVal('inp-party');
  } catch (e) {
    console.error('[registerCandidate]', e);
    toast('Registration failed', e.message, 'error');
  } finally {
    setBtn(ID, false, 'Register Candidate');
  }
}

async function onRegisterVoter() {
  if (!isWalletConnected()) { toast('Connect wallet first', '', 'warning'); return; }

  const vName = getVal('inp-vname');
  if (!vName) { toast('Enter your name', '', 'warning'); return; }
  if (vName.length > CFG.MAX_NAME) {
    toast(`Max ${CFG.MAX_NAME} characters`, '', 'warning'); return;
  }

  const ID = 'btn-reg-voter';
  setBtn(ID, true, 'Register as Voter');
  try {
    const wallet = getWallet();
    const pda    = await findVoterPDA(vName, wallet);
    const ix     = await buildRegisterVoterIx(wallet, pda, vName);
    const sig    = await sendAndConfirm(ix);

    State.voterPDA = pda;
    State.voterCount++;
    updateStats(State.candidates, State.voterCount);


    if (State.selectedPDA) el('btn-cast-vote').disabled = false;

    logTx(`Registered voter: ${vName}`, sig);
    toast('Voter registered!', 'You can now cast your vote.', 'success');
    clearVal('inp-vname');
  } catch (e) {
    console.error('[registerVoter]', e);
    toast('Registration failed', e.message, 'error');
  } finally {
    setBtn(ID, false, 'Register as Voter');
  }
}

/* ── ACTION: CAST VOTE ───────────────────────────────────────── */
async function onCastVote() {
  if (!isWalletConnected())   { toast('Connect wallet first', '', 'warning');   return; }
  if (!State.selectedPDA)     { toast('Select a candidate first', '', 'warning'); return; }
  if (!State.voterPDA)        { toast('Register as voter first', '', 'warning'); return; }
  if (State.hasVoted)         { toast('You have already voted', '', 'warning');  return; }

  const ID = 'btn-cast-vote';
  setBtn(ID, true, 'Cast Vote');
  try {
    const candidatePDA = new PublicKey(State.selectedPDA);
    const ix  = await buildCastVoteIx(getWallet(), State.voterPDA, candidatePDA);
    const sig = await sendAndConfirm(ix);

    const c = State.candidates.find(c => c.pda === State.selectedPDA);
    if (c) c.votes++;
    State.hasVoted = true;
    updateStats(State.candidates, State.voterCount);
    renderCandidates(State.candidates, State.selectedPDA, selectCandidate);

    el(ID).disabled  = true;
    el(ID).innerHTML = '✓ Vote Recorded';

    logTx(`Vote cast → ${c?.name ?? State.selectedPDA}`, sig);
    toast('Vote cast!', `Your vote for ${c?.name} is on-chain.`, 'success');
  } catch (e) {
    console.error('[castVote]', e);
    const msg = e.message?.includes('AlreadyVoted')
      ? 'This account has already voted.'
      : e.message;
    toast('Vote failed', msg, 'error');
    setBtn(ID, false, 'Cast Vote');
  }
}