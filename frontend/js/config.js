
const CFG = Object.freeze({

  // ── Solana program ─────────────────────────────────────────────
PROGRAM_ID: 'ArJc7rF9ygzDCeUxu3Vf4QKbHfixs6rvUAZcHtQ3wiWd',

  // ── Network ────────────────────────────────────────────────────
  CLUSTER:  'devnet',                           // 'devnet' | 'mainnet-beta'
  RPC_URL:  'https://api.devnet.solana.com',
  EXPLORER: 'https://explorer.solana.com',

  // ── On-chain field limits (must match Rust #[max_len]) ─────────
  MAX_NAME: 20,

  // ── Account sizes (discriminator 8 + all fields) ───────────────
  //   Candidate: 8 disc + 32 pubkey + (4+20) party + (4+20) name + 1 u8  = 89
  //   Voter:     8 disc + 32 pubkey + (4+20) name + 1 bool              = 65
  CANDIDATE_SIZE: 89,
  VOTER_SIZE:     65,

  // ── UI ─────────────────────────────────────────────────────────
  TOAST_MS:   5000,    // toast auto-dismiss duration
  POLL_MS:    15000,   // how often to refresh candidates from chain
});