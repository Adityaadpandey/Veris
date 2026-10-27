use anchor_lang::prelude::*;
use anchor_lang::solana_program::sysvar::instructions::{
    load_current_index_checked, load_instruction_at_checked,
};

use crate::errors::VerisError;

/// Address of the native ed25519 program. `anchor_lang::solana_program` (0.32.x,
/// built on the split solana-* crates) does not re-export `ed25519_program`, so
/// the well-known address is declared directly via the `pubkey!` macro.
pub const ED25519_ID: Pubkey = pubkey!("Ed25519SigVerify111111111111111111111111111");

/// Scan instructions before the current one for a native ed25519 verify of
/// `sig` over `msg` (32-byte image hash) by `pubkey`.
pub fn require_ed25519_verify(
    ix_sysvar: &AccountInfo, pubkey: &Pubkey, msg: &[u8; 32], sig: &[u8; 64],
) -> Result<()> {
    let current = load_current_index_checked(ix_sysvar)? as usize;
    for i in 0..current {
        let ix = load_instruction_at_checked(i, ix_sysvar)?;
        if ix.program_id != ED25519_ID || !ix.accounts.is_empty() { continue; }
        let d = &ix.data;
        if d.len() < 16 || d[0] != 1 { continue; } // one signature expected
        let u16le = |o: usize| u16::from_le_bytes([d[o], d[o + 1]]);
        let (sig_off, sig_idx) = (u16le(2) as usize, u16le(4));
        let (pk_off, pk_idx) = (u16le(6) as usize, u16le(8));
        let (msg_off, msg_len, msg_idx) = (u16le(10) as usize, u16le(12) as usize, u16le(14));
        // offsets must point into this same instruction
        let self_ref = |idx: u16| idx == u16::MAX || idx as usize == i;
        if !(self_ref(sig_idx) && self_ref(pk_idx) && self_ref(msg_idx)) { continue; }
        if d.len() < pk_off + 32 || d.len() < sig_off + 64 || d.len() < msg_off + msg_len { continue; }
        if d[pk_off..pk_off + 32] != pubkey.to_bytes() { continue; }
        require!(msg_len == 32 && d[msg_off..msg_off + 32] == msg[..]
                 && d[sig_off..sig_off + 64] == sig[..], VerisError::SignatureMismatch);
        return Ok(());
    }
    err!(VerisError::MissingEd25519Verification)
}
