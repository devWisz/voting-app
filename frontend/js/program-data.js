/**
 * program-data.js
 * ─────────────────────────────────────────────────────────────────
 * Static strings used by the Program tab:
 *   RUST_LIB     – full annotated lib.rs source
 *   CARGO_PKG    – program-level Cargo.toml
 *   CARGO_WS     – workspace Cargo.toml
 *   ANCHOR_TOML  – Anchor.toml
 *   IDL          – parsed IDL object (also written to vote_app.json)
 * ─────────────────────────────────────────────────────────────────
 */

/* ── lib.rs ──────────────────────────────────────────────────── */
const RUST_LIB = `use anchor_lang::prelude::*;

declare_id!("ArJc7rF9ygzDCeUxu3Vf4QKbHfixs6rvUAZcHtQ3wiWd");

// ────────────────────────────────────────────────────────────────
//  PROGRAM MODULE
//  Three public instructions:
//    1. register_candidate  – create a candidate PDA
//    2. register_voter      – create a voter PDA (one per wallet)
//    3. cast_vote           – voter casts ballot for one candidate
// ────────────────────────────────────────────────────────────────
#[program]
pub mod vote_app {
    use super::*;

    /// Register a new candidate on-chain.
    /// PDA is seeded by (c_name, payer) — unique per name per wallet.
    pub fn register_candidate(
        ctx: Context<RegisterCandidate>,
        c_name: String,
        party_name: String,
    ) -> Result<()> {
        require!(c_name.len() <= 20, VotingError::NameTooLong);
        require!(party_name.len() <= 20, VotingError::NameTooLong);

        let candidate = &mut ctx.accounts.candidate;
        candidate.set_inner(Candidate {
            c_id:       ctx.accounts.payer.key(),
            party_name: party_name,
            c_name:     c_name,
            votes:      0,
        });
        Ok(())
    }

    /// Register a voter on-chain.
    /// PDA seeded by (v_name, payer) — one account per wallet.
    pub fn register_voter(
        ctx: Context<RegisterVoter>,
        v_name: String,
    ) -> Result<()> {
        require!(v_name.len() <= 20, VotingError::NameTooLong);

        let voter = &mut ctx.accounts.voter;
        voter.set_inner(Voter {
            v_id:     ctx.accounts.payer.key(),
            v_name:   v_name,
            is_voted: false,
        });
        Ok(())
    }

    /// Cast a vote. Two on-chain guards:
    ///   1. voter.is_voted must be false (no double voting)
    ///   2. voter.v_id must equal signer  (only owner can vote)
    pub fn cast_vote(ctx: Context<CastVote>) -> Result<()> {
        let voter     = &mut ctx.accounts.voter;
        let candidate = &mut ctx.accounts.candidate;

        require!(!voter.is_voted,
            VotingError::AlreadyVoted);
        require!(voter.v_id == ctx.accounts.payer.key(),
            VotingError::NotTheOwner);

        candidate.votes = candidate.votes.saturating_add(1);
        voter.is_voted  = true;
        Ok(())
    }
}

// ────────────────────────────────────────────────────────────────
//  ACCOUNT DATA STRUCTS
// ────────────────────────────────────────────────────────────────

/// On-chain candidate record.
/// Total size: 8 (disc) + 32 + (4+20) + (4+20) + 1 = 89 bytes
#[account]
#[derive(InitSpace)]
pub struct Candidate {
    pub c_id:       Pubkey,     // 32 bytes — creator wallet
    #[max_len(20)]
    pub party_name: String,     // 4 + ≤20 bytes
    #[max_len(20)]
    pub c_name:     String,     // 4 + ≤20 bytes
    pub votes:      u8,         // 1 byte  — saturating at 255
}

/// On-chain voter record.
/// Total size: 8 (disc) + 32 + (4+20) + 1 = 65 bytes
#[account]
#[derive(InitSpace)]
pub struct Voter {
    pub v_id:     Pubkey,       // 32 bytes — voter wallet
    #[max_len(20)]
    pub v_name:   String,       // 4 + ≤20 bytes
    pub is_voted: bool,         // 1 byte  — flipped after cast_vote
}

// ────────────────────────────────────────────────────────────────
//  CUSTOM ERROR CODES
// ────────────────────────────────────────────────────────────────
#[error_code]
pub enum VotingError {
    #[msg("This voter has already cast their vote")]
    AlreadyVoted,   // 6000

    #[msg("Signer is not the owner of this voter account")]
    NotTheOwner,    // 6001

    #[msg("Name exceeds maximum length of 20 characters")]
    NameTooLong,    // 6002
}

// ────────────────────────────────────────────────────────────────
//  ACCOUNTS CONTEXTS
// ────────────────────────────────────────────────────────────────

/// register_candidate — seeds: [c_name.as_bytes(), payer.key()]
#[derive(Accounts)]
#[instruction(c_name: String)]
pub struct RegisterCandidate<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        space  = 8 + Candidate::INIT_SPACE,
        payer  = payer,
        seeds  = [c_name.as_bytes(), payer.key().as_ref()],
        bump
    )]
    pub candidate: Account<'info, Candidate>,

    pub system_program: Program<'info, System>,
}

/// register_voter — seeds: [v_name.as_bytes(), payer.key()]
#[derive(Accounts)]
#[instruction(v_name: String)]
pub struct RegisterVoter<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        space = 8 + Voter::INIT_SPACE,
        payer = payer,
        seeds = [v_name.as_bytes(), payer.key().as_ref()],
        bump
    )]
    pub voter: Account<'info, Voter>,

    pub system_program: Program<'info, System>,
}

/// cast_vote — voter and candidate passed in by the client.
/// Ownership + double-vote guards inside the instruction body.
#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub voter: Account<'info, Voter>,

    #[account(mut)]
    pub candidate: Account<'info, Candidate>,
}`;

/* ── programs/vote_app/Cargo.toml ────────────────────────────── */
const CARGO_PKG = `[package]
name    = "vote_app"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "lib"]
name       = "vote_app"

[features]
default        = []
no-entrypoint  = []
no-idl         = []
no-log-ix-name = []
cpi            = ["no-entrypoint"]
idl-build      = ["anchor-lang/idl-build"]

[dependencies]
anchor-lang = { version = "0.29.0", features = ["init-if-needed"] }`;

/* ── workspace Cargo.toml ────────────────────────────────────── */
const CARGO_WS = `[workspace]
members  = ["programs/*"]
resolver = "2"

[profile.release]
overflow-checks = true
lto             = "thin"`;

/* ── Anchor.toml ─────────────────────────────────────────────── */
const ANCHOR_TOML = `[toolchain]
anchor_version = "0.29.0"

[features]
seeds     = false
skip-lint = false

[programs.localnet]
vote_app = "ArJc7rF9ygzDCeUxu3Vf4QKbHfixs6rvUAZcHtQ3wiWd"

[programs.devnet]
vote_app = "ArJc7rF9ygzDCeUxu3Vf4QKbHfixs6rvUAZcHtQ3wiWd"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "devnet"
wallet  = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"`;

/* ── IDL (matches target/idl/vote_app.json exactly) ──────────── */
const IDL = {
  "version": "0.1.0",
  "name": "vote_app",
  "instructions": [
    {
      "name": "registerCandidate",
      "accounts": [
        { "name": "payer",         "isMut": true,  "isSigner": true  },
        { "name": "candidate",     "isMut": true,  "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "cName",     "type": "string" },
        { "name": "partyName", "type": "string" }
      ]
    },
    {
      "name": "registerVoter",
      "accounts": [
        { "name": "payer",         "isMut": true,  "isSigner": true  },
        { "name": "voter",         "isMut": true,  "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "vName", "type": "string" }
      ]
    },
    {
      "name": "castVote",
      "accounts": [
        { "name": "payer",     "isMut": true, "isSigner": true  },
        { "name": "voter",     "isMut": true, "isSigner": false },
        { "name": "candidate", "isMut": true, "isSigner": false }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "Candidate",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "cId",       "type": "publicKey" },
          { "name": "partyName", "type": "string"    },
          { "name": "cName",     "type": "string"    },
          { "name": "votes",     "type": "u8"        }
        ]
      }
    },
    {
      "name": "Voter",
      "type": {
        "kind": "struct",
        "fields": [
          { "name": "vId",     "type": "publicKey" },
          { "name": "vName",   "type": "string"    },
          { "name": "isVoted", "type": "bool"      }
        ]
      }
    }
  ],
  "errors": [
    { "code": 6000, "name": "AlreadyVoted", "msg": "This voter has already cast their vote" },
    { "code": 6001, "name": "NotTheOwner",  "msg": "Signer is not the owner of this voter account" },
    { "code": 6002, "name": "NameTooLong",  "msg": "Name exceeds maximum length of 20 characters" }
  ],
  "metadata": {
    "address": "ArJc7rF9ygzDCeUxu3Vf4QKbHfixs6rvUAZcHtQ3wiWd"
  }
};