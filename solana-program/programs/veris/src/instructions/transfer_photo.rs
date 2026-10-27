use anchor_lang::prelude::*;

use crate::errors::VerisError;
use crate::events::PhotoTransferred;
use crate::state::PhotoRecord;

pub fn transfer_photo_handler(ctx: Context<TransferPhoto>, new_owner: Pubkey) -> Result<()> {
    require!(
        ctx.accounts.owner.key() == ctx.accounts.photo_record.owner,
        VerisError::Unauthorized
    );

    let photo = &mut ctx.accounts.photo_record;
    photo.owner = new_owner;

    emit!(PhotoTransferred {
        photo: photo.key(),
        new_owner,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct TransferPhoto<'info> {
    #[account(
        mut,
        seeds = [b"photo", photo_record.image_hash.as_ref()],
        bump = photo_record.bump
    )]
    pub photo_record: Account<'info, PhotoRecord>,
    pub owner: Signer<'info>,
}
