use anchor_lang::prelude::*;

use crate::errors::VerisError;
use crate::events::EditionMinted;
use crate::state::{Edition, PhotoRecord};

pub fn mint_edition_handler(ctx: Context<MintEdition>, recipient: Pubkey) -> Result<()> {
    let photo = &mut ctx.accounts.photo_record;
    require!(
        photo.max_editions == 0 || photo.edition_count < photo.max_editions,
        VerisError::MaxEditionsReached
    );

    photo.edition_count = photo.edition_count.checked_add(1).unwrap();
    let number = photo.edition_count;
    let photo_key = photo.key();

    let edition = &mut ctx.accounts.edition;
    edition.photo = photo_key;
    edition.number = number;
    edition.owner = recipient;
    edition.minted_at = Clock::get()?.unix_timestamp;
    edition.bump = ctx.bumps.edition;

    emit!(EditionMinted {
        edition: edition.key(),
        photo: photo_key,
        number,
        owner: recipient,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct MintEdition<'info> {
    #[account(
        mut,
        seeds = [b"photo", photo_record.image_hash.as_ref()],
        bump = photo_record.bump
    )]
    pub photo_record: Account<'info, PhotoRecord>,
    #[account(
        init,
        payer = payer,
        space = 8 + Edition::INIT_SPACE,
        seeds = [
            b"edition",
            photo_record.key().as_ref(),
            (photo_record.edition_count + 1).to_le_bytes().as_ref()
        ],
        bump
    )]
    pub edition: Account<'info, Edition>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
