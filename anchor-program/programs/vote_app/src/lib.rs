use anchor_lang::prelude::*;

declare_id!("ArJc7rF9ygzDCeUxu3Vf4QKbHfixs6rvUAZcHtQ3wiWd");

// ─────────────────────────────────────────────────────────────────────────────
//  PROGRAM MODULE
//  Three public instructions:
//    1. register_candidate  – anyone can register a candidate PDA
//    2. register_voter      – any wallet can register once as a voter
//    3. cast_vote           – a registered voter votes for one candidate
// ─────────────────────────────────────────────────────────────────────────────
#[program]
pub mod vote_app {
    use super::*;

    /// Register a new candidate on-chain.
    /// The candidate account is a PDA seeded by (c_name, payer).
    /// This ensures one unique account per name per wallet.
    pub fn register_candidate(
        ctx: Context<RegisterCandidate>,
        c_name: String,
        party_name: String,
    ) -> Result<()> {
        require!(c_name.len() <= 20, VotingError::NameTooLong);
        require!(party_name.len() <= 20, VotingError::NameTooLong);

        let candidate = &mut ctx.accounts.candidate;
        candidate.set_inner(Candidate {
            c_id: ctx.accounts.payer.key(),
            party_name,
            c_name,
            votes: 0,
        });
        Ok(())
    }

    /// Register a voter on-chain.
    /// The voter account is a PDA seeded by (v_name, payer).
    /// is_voted starts as false; flipped to true after cast_vote.
    pub fn register_voter(
        ctx: Context<RegisterVoter>,
        v_name: String,
    ) -> Result<()> {
        require!(v_name.len() <= 20, VotingError::NameTooLong);

        let voter = &mut ctx.accounts.voter;
        voter.set_inner(Voter {
            v_id: ctx.accounts.payer.key(),
            v_name,
            is_voted: false,
        });
        Ok(())
    }

    /// Cast a vote for a candidate.
    /// Guards:
    ///   - voter.is_voted must be false  (no double voting)
    ///   - voter.v_id must equal signer  (only owner can vote)
    pub fn cast_vote(ctx: Context<CastVote>) -> Result<()> {
        let voter     = &mut ctx.accounts.voter;
        let candidate = &mut ctx.accounts.candidate;

        require!(!voter.is_voted,                         VotingError::AlreadyVoted);
        require!(voter.v_id == ctx.accounts.payer.key(),  VotingError::NotTheOwner);

        candidate.votes = candidate.votes.saturating_add(1);
        voter.is_voted  = true;
        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ACCOUNT DATA STRUCTS
// ─────────────────────────────────────────────────────────────────────────────

/// On-chain candidate record.
///
/// Byte layout (after 8-byte Anchor discriminator):
///   [0..32]  c_id        – creator / candidate Pubkey
///   [32..56] party_name  – Borsh string (4-byte len + ≤20 bytes)
///   [56..80] c_name      – Borsh string (4-byte len + ≤20 bytes)
///   [80]     votes       – u8, incremented on each cast_vote call
#[account]
#[derive(InitSpace)]
pub struct Candidate {
    pub c_id:       Pubkey,
    #[max_len(20)]
    pub party_name: String,
    #[max_len(20)]
    pub c_name:     String,
    pub votes:      u8,     // max 255 votes per candidate
}

/// On-chain voter record.
///
/// Byte layout (after 8-byte Anchor discriminator):
///   [0..32]  v_id     – voter's wallet Pubkey
///   [32..56] v_name   – Borsh string (4-byte len + ≤20 bytes)
///   [56]     is_voted – bool, prevents double voting
#[account]
#[derive(InitSpace)]
pub struct Voter {
    pub v_id:     Pubkey,
    #[max_len(20)]
    pub v_name:   String,
    pub is_voted: bool,
}

// ─────────────────────────────────────────────────────────────────────────────
//  CUSTOM ERROR CODES
// ─────────────────────────────────────────────────────────────────────────────
#[error_code]
pub enum VotingError {
    /// Voter has already cast their ballot — is_voted == true.
    #[msg("This voter has already cast their vote")]
    AlreadyVoted,

    /// The transaction signer does not own this voter account.
    #[msg("Signer is not the owner of this voter account")]
    NotTheOwner,

    /// A name field exceeds the 20-character on-chain limit.
    #[msg("Name exceeds maximum length of 20 characters")]
    NameTooLong,
}

// ─────────────────────────────────────────────────────────────────────────────
//  ACCOUNTS CONTEXTS
// ─────────────────────────────────────────────────────────────────────────────

/// Accounts required for register_candidate.
///
/// PDA seeds: [ c_name.as_bytes(), payer.key().as_ref() ]
/// This makes every candidate uniquely addressed by name + creator wallet.
#[derive(Accounts)]
#[instruction(c_name: String)]
pub struct RegisterCandidate<'info> {
    /// The wallet paying for account rent and signing the transaction.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Candidate PDA — created here, owned by the program.
    #[account(
        init,
        space  = 8 + Candidate::INIT_SPACE,
        payer  = payer,
        seeds  = [c_name.as_bytes(), payer.key().as_ref()],
        bump
    )]
    pub candidate: Account<'info, Candidate>,

    /// Required by Anchor's init constraint to create the account.
    pub system_program: Program<'info, System>,
}

/// Accounts required for register_voter.
///
/// PDA seeds: [ v_name.as_bytes(), payer.key().as_ref() ]
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

/// Accounts required for cast_vote.
///
/// The voter and candidate PDAs are passed by the client.
/// Ownership + double-vote checks are enforced inside the instruction.
#[derive(Accounts)]
pub struct CastVote<'info> {
    /// Must be the same wallet that created the voter account.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Voter PDA — is_voted flipped to true after success.
    #[account(mut)]
    pub voter: Account<'info, Voter>,

    /// Candidate PDA — votes incremented by 1 after success.
    #[account(mut)]
    pub candidate: Account<'info, Candidate>,
}