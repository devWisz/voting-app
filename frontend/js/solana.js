/**
 * solana.js
 * ─────────────────────────────────────────────────────────────────
 * All Solana / Anchor interaction — zero UI code in this file.
 *
 * Sections:
 *   1. Module state & init
 *   2. Wallet helpers
 *   3. Anchor discriminator + Borsh encoding
 *   4. PDA derivation  (mirrors Rust seeds exactly)
 *   5. Instruction builders (one per program instruction)
 *   6. Transaction send & confirm
 *   7. Account fetching and parsing
 *   8. Explorer URL helpers
 * ─────────────────────────────────────────────────────────────────
 */

/* ── 0. Web3 aliases ─────────────────────────────────────────── */
const {
  Connection, PublicKey, Transaction,
  TransactionInstruction, SystemProgram,
} = solanaWeb3;

/* ── 1. Module state ─────────────────────────────────────────── */
let _conn      = null;   // Connection
let _wallet    = null;   // PublicKey of connected wallet
let _programId = null;   // PublicKey of deployed program

/** Call once on page load. */
function solana_init() {
  _conn      = new Connection(CFG.RPC_URL, 'confirmed');
  _programId = new PublicKey(CFG.PROGRAM_ID);
}

/* Getters */
const getConn      = () => _conn;
const getWallet    = () => _wallet;
const getProgramId = () => _programId;
const isWalletConnected = () => _wallet !== null;

/* ── 2. Wallet ───────────────────────────────────────────────── */

/**
 * Connect Phantom wallet.
 * @param {boolean} silent  – if true, only connect if already trusted
 * @returns {PublicKey}
 */
async function connectWallet(silent = false) {
  if (!window.solana) throw new Error('Phantom not found — install at phantom.app');

  const resp = silent
    ? await window.solana.connect({ onlyIfTrusted: true })
    : await window.solana.connect();

  _wallet = resp.publicKey;
  return _wallet;
}

function disconnectWallet() {
  _wallet = null;
  window.solana?.disconnect?.();
}

/* ── 3. Anchor discriminator + Borsh encoding ───────────────── */

/**
 * Compute the 8-byte Anchor instruction discriminator.
 * Formula: sha256("global:<method_name>")[0..8]
 */
async function discriminator(methodName) {
  const msg  = new TextEncoder().encode(`global:${methodName}`);
  const hash = await crypto.subtle.digest('SHA-256', msg);
  return new Uint8Array(hash).slice(0, 8);
}

/**
 * Borsh-encode a string: 4-byte LE length prefix + UTF-8 bytes.
 * Matches Anchor's default serialiser used on the Rust side.
 */
function borshString(str) {
  const bytes = new TextEncoder().encode(str);
  const buf   = new ArrayBuffer(4 + bytes.length);
  new DataView(buf).setUint32(0, bytes.length, /* littleEndian */ true);
  new Uint8Array(buf).set(bytes, 4);
  return new Uint8Array(buf);
}

/** Concatenate multiple Uint8Arrays into one. */
function concat(...parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out   = new Uint8Array(total);
  let offset  = 0;
  for (const p of parts) { out.set(p, offset); offset += p.length; }
  return out;
}

/* ── 4. PDA derivation ───────────────────────────────────────── */
// Seeds must exactly match the Rust #[account(seeds = [...])] attrs.

/**
 * Derive Candidate PDA.
 * seeds: [ c_name.as_bytes(), payer.key().as_ref() ]
 */
async function findCandidatePDA(cName, payerPubkey) {
  const [pda] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode(cName), payerPubkey.toBuffer()],
    _programId,
  );
  return pda;
}

/**
 * Derive Voter PDA.
 * seeds: [ v_name.as_bytes(), payer.key().as_ref() ]
 */
async function findVoterPDA(vName, payerPubkey) {
  const [pda] = await PublicKey.findProgramAddress(
    [new TextEncoder().encode(vName), payerPubkey.toBuffer()],
    _programId,
  );
  return pda;
}

/* ── 5. Instruction builders ─────────────────────────────────── */

/**
 * Build `register_candidate` instruction.
 *
 * Rust fn signature:
 *   pub fn register_candidate(ctx, c_name: String, party_name: String)
 *
 * Data layout: [ disc(8) | c_name_borsh | party_name_borsh ]
 */
async function buildRegisterCandidateIx(payer, candidatePDA, cName, partyName) {
  const disc = await discriminator('register_candidate');
  const data = concat(disc, borshString(cName), borshString(partyName));

  return new TransactionInstruction({
    programId: _programId,
    data,
    keys: [
      { pubkey: payer,                   isSigner: true,  isWritable: true  },
      { pubkey: candidatePDA,            isSigner: false, isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });
}

/**
 * Build `register_voter` instruction.
 *
 * Rust fn signature:
 *   pub fn register_voter(ctx, v_name: String)
 *
 * Data layout: [ disc(8) | v_name_borsh ]
 */
async function buildRegisterVoterIx(payer, voterPDA, vName) {
  const disc = await discriminator('register_voter');
  const data = concat(disc, borshString(vName));

  return new TransactionInstruction({
    programId: _programId,
    data,
    keys: [
      { pubkey: payer,                   isSigner: true,  isWritable: true  },
      { pubkey: voterPDA,                isSigner: false, isWritable: true  },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
  });
}

/**
 * Build `cast_vote` instruction.
 *
 * Rust fn signature:
 *   pub fn cast_vote(ctx)   ← no extra args
 *
 * Data layout: [ disc(8) ]  (discriminator only)
 */
async function buildCastVoteIx(payer, voterPDA, candidatePDA) {
  const disc = await discriminator('cast_vote');

  return new TransactionInstruction({
    programId: _programId,
    data: disc,
    keys: [
      { pubkey: payer,        isSigner: true,  isWritable: true  },
      { pubkey: voterPDA,     isSigner: false, isWritable: true  },
      { pubkey: candidatePDA, isSigner: false, isWritable: true  },
    ],
  });
}

/* ── 6. Send & confirm ───────────────────────────────────────── */

/**
 * Sign and send a single-instruction transaction via Phantom.
 * Returns the transaction signature string on success.
 */
async function sendAndConfirm(ix) {
  const tx = new Transaction().add(ix);
  tx.feePayer = _wallet;

  const { blockhash } = await _conn.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;

  const signed = await window.solana.signTransaction(tx);
  const sig    = await _conn.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  const result = await _conn.confirmTransaction(sig, 'confirmed');
  if (result.value.err) throw new Error('Transaction confirmed with error');

  return sig;
}

/* ── 7. Account fetching & parsing ──────────────────────────── */

/** Fetch all program accounts of a given on-chain byte size. */
async function fetchAccountsBySize(size) {
  return _conn.getProgramAccounts(_programId, {
    filters: [{ dataSize: size }],
  });
}

/**
 * Parse raw Candidate account data (after discriminator).
 *
 * Rust layout:
 *   [8]     discriminator  (skip)
 *   [32]    c_id  (Pubkey)
 *   [4+N]   party_name (Borsh string)
 *   [4+N]   c_name     (Borsh string)
 *   [1]     votes      (u8)
 */
function parseCandidate(pdaStr, rawData) {
  const data = rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData);
  const view = new DataView(data.buffer, data.byteOffset);
  let   off  = 8;                           // skip 8-byte discriminator

  off += 32;                                // skip c_id Pubkey

  const partyLen = view.getUint32(off, true); off += 4;
  const party    = new TextDecoder().decode(data.slice(off, off + partyLen));
  off += partyLen;

  const nameLen = view.getUint32(off, true); off += 4;
  const name    = new TextDecoder().decode(data.slice(off, off + nameLen));
  off += nameLen;

  const votes = data[off];

  return { pda: pdaStr, name, party, votes };
}

/**
 * Parse raw Voter account data.
 *
 * Rust layout:
 *   [8]     discriminator
 *   [32]    v_id  (Pubkey)
 *   [4+N]   v_name (Borsh string)
 *   [1]     is_voted (bool)
 */
function parseVoter(pdaStr, rawData) {
  const data = rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData);
  const view = new DataView(data.buffer, data.byteOffset);
  let   off  = 8;

  const vId = new PublicKey(data.slice(off, off + 32)).toString(); off += 32;

  const nameLen = view.getUint32(off, true); off += 4;
  const name    = new TextDecoder().decode(data.slice(off, off + nameLen));
  off += nameLen;

  const isVoted = data[off] === 1;

  return { pda: pdaStr, vId, name, isVoted };
}

/* ── 8. Explorer helpers ─────────────────────────────────────── */

const explorerTx   = sig  => `${CFG.EXPLORER}/tx/${sig}?cluster=${CFG.CLUSTER}`;
const explorerAddr = addr => `${CFG.EXPLORER}/address/${addr}?cluster=${CFG.CLUSTER}`;
const shortKey     = (pk, n = 4) => { const s = String(pk); return `${s.slice(0,n)}…${s.slice(-n)}`; };