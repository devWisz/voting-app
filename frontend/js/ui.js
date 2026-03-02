
const el = id => document.getElementById(id);

const ICONS = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };

/**
 * Show a floating toast notification.
 * @param {string} title
 * @param {string} [msg='']
 * @param {'success'|'error'|'info'|'warning'} [type='info']
 */
function toast(title, msg = '', type = 'info') {
  const box  = el('toast-box');
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.innerHTML = `
    <span class="toast-icon">${ICONS[type] ?? 'ℹ'}</span>
    <div>
      <div class="toast-title">${esc(title)}</div>
      ${msg ? `<div class="toast-msg">${esc(msg)}</div>` : ''}
    </div>`;
  box.appendChild(node);

  setTimeout(() => {
    node.style.transition = 'opacity .25s, transform .25s';
    node.style.opacity    = '0';
    node.style.transform  = 'translateY(8px)';
    setTimeout(() => node.remove(), 260);
  }, CFG.TOAST_MS);
}

/* ── BUTTON LOADING STATE ────────────────────────────────────── */
/**
 * Toggle a button between its default label and a loading spinner.
 * @param {string} id        – element id
 * @param {boolean} loading
 * @param {string} label     – original button text (restored when loading=false)
 */
function setBtn(id, loading, label) {
  const btn = el(id);
  if (!btn) return;
  btn.disabled  = loading;
  btn.innerHTML = loading
    ? `<span class="spinner"></span> Processing…`
    : label;
}

/* ── TX LOG ──────────────────────────────────────────────────── */
let _txLogFresh = true;

/**
 * Prepend an entry to the transaction log panel.
 * @param {string} label  – human-readable description
 * @param {string} sig    – transaction signature
 */
function logTx(label, sig) {
  const log = el('tx-log');
  if (_txLogFresh) { log.innerHTML = ''; _txLogFresh = false; }

  const time  = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  const entry = document.createElement('div');
  entry.className = 'tx-row';
  entry.innerHTML = `
    <div class="tx-dot"></div>
    <span class="tx-time">${time}</span>
    <span class="tx-label">${esc(label)}</span>
    <a class="tx-link" href="${explorerTx(sig)}" target="_blank" rel="noopener">
      ${sig.slice(0,8)}…${sig.slice(-4)}
    </a>`;
  log.prepend(entry);
}

/* ── STATS ───────────────────────────────────────────────────── */
/**
 * Update the three stat counters in the hero section.
 * @param {Array}  candidates
 * @param {number} voterCount
 */
function updateStats(candidates, voterCount) {
  el('stat-candidates').textContent  = candidates.length;
  el('stat-voters').textContent      = voterCount;
  el('stat-total-votes').textContent = candidates.reduce((s, c) => s + c.votes, 0);
}

/* ── CANDIDATE LIST ──────────────────────────────────────────── */
/**
 * Render (or re-render) the candidates list.
 * @param {Array}    candidates   – [{ pda, name, party, votes }]
 * @param {string}   selectedPDA  – currently selected PDA string (or null)
 * @param {Function} onSelect     – callback(pdaString)
 */
function renderCandidates(candidates, selectedPDA, onSelect) {
  const list = el('candidates-list');
  if (!candidates.length) {
    list.innerHTML = `
      <div class="empty">
        <span class="empty-icon">🗳️</span>
        No candidates registered yet.<br/>Register one above to get started.
      </div>`;
    return;
  }

  const total = candidates.reduce((s, c) => s + c.votes, 0);
  list.innerHTML = candidates.map(c => {
    const pct = total ? Math.round((c.votes / total) * 100) : 0;
    const sel = selectedPDA === c.pda;
    return `
      <div class="c-card ${sel ? 'selected' : ''}"
           onclick="${onSelect.name}('${c.pda}')">
        <div class="radio"><div class="radio-dot"></div></div>
        <div class="c-info">
          <div class="c-name">${esc(c.name)}</div>
          <div class="c-party">${esc(c.party)}</div>
          <div class="vote-bar-wrap">
            <div class="vote-bar">
              <div class="vote-bar-fill" style="width:${pct}%"></div>
            </div>
          </div>
        </div>
        <div class="c-meta">
          <div class="c-votes">${c.votes}</div>
          <span class="c-pct">${pct}%</span>
        </div>
      </div>`;
  }).join('');
}

/* ── WALLET STATUS ───────────────────────────────────────────── */
function renderWalletOn(pubkey) {
  const btn = el('wallet-btn');
  btn.innerHTML = `<span class="dot"></span> ${shortKey(pubkey)}`;
  btn.classList.add('connected');

  el('status-bar').innerHTML = `
    <div class="alert alert-success">
      <span class="alert-icon">✓</span>
      <span>Connected — <strong>${pubkey.toString()}</strong></span>
    </div>`;
}

function renderWalletOff() {
  const btn = el('wallet-btn');
  btn.innerHTML = `<span class="dot"></span> Connect Wallet`;
  btn.classList.remove('connected');

  el('status-bar').innerHTML = `
    <div class="alert alert-info">
      <span class="alert-icon">ℹ</span>
      <span>Connect your <strong>Phantom</strong> wallet to interact with the program.</span>
    </div>`;
}


const getVal   = id => el(id)?.value?.trim() ?? '';
const clearVal = id => { if (el(id)) el(id).value = ''; };

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}