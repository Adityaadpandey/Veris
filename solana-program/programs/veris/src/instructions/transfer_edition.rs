use anchor_lang::prelude::*;

use crate::errors::VerisError;
use crate::events::EditionTransferred;
use crate::state::Edition;

pub fn transfer_edition_handler(ctx: Context<TransferEdition>, new_owner: Pubkey) -> Result<()> {
    require!(
        ctx.accounts.owner.key() == ctx.accounts.edition.owner,
        VerisError::Unauthorized
    );

    let edition = &mut ctx.accounts.edition;
    edition.owner = new_owner;

    emit!(EditionTransferred {
        edition: edition.key(),
        new_owner,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct TransferEdition<'info> {
    #[account(
        mut,
        seeds = [b"edition", edition.photo.as_ref(), edition.number.to_le_bytes().as_ref()],
        bump = edition.bump
    )]
    pub edition: Account<'info, Edition>,
    pub owner: Signer<'info>,
}
