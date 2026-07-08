use anchor_lang::prelude::*;

use crate::ed25519::require_ed25519_verify;
use crate::errors::VerisError;
use crate::events::PhotoMinted;
use crate::state::{Config, Device, PhotoRecord};

pub fn mint_photo_handler(
    ctx: Context<MintPhoto>,
    image_hash: [u8; 32],
    cid: String,
    signature: [u8; 64],
    captured_at: i64,
    max_editions: u64,
    owner: Pubkey,
) -> Result<()> {
    require!(!cid.is_empty() && cid.len() <= 96, VerisError::InvalidInput);
    require!(ctx.accounts.device.is_active, VerisError::DeviceNotActive);

    require_ed25519_verify(
        &ctx.accounts.instructions_sysvar,
        &ctx.accounts.device_signer.key(),
        &image_hash,
        &signature,
    )?;

    let config = &mut ctx.accounts.config;
    config.total_photos = config.total_photos.checked_add(1).unwrap();

    let device_pubkey = ctx.accounts.device.device_pubkey;
    let device_id = ctx.accounts.device.device_id.clone();

    let photo = &mut ctx.accounts.photo_record;
    photo.index = config.total_photos;
    photo.device_pubkey = device_pubkey;
    photo.device_id = device_id;
    photo.cid = cid;
    photo.image_hash = image_hash;
    photo.signature = signature;
    photo.captured_at = captured_at;
    photo.minted_at = Clock::get()?.unix_timestamp;
    photo.max_editions = max_editions;
    photo.edition_count = 0;
    photo.owner = owner;
    photo.bump = ctx.bumps.photo_record;

    emit!(PhotoMinted {
        photo: photo.key(),
        index: photo.index,
        device_pubkey: photo.device_pubkey,
        image_hash: photo.image_hash,
        cid: photo.cid.clone(),
        owner: photo.owner,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(image_hash: [u8; 32])]
pub struct MintPhoto<'info> {
    #[account(seeds = [b"device", device.device_pubkey.as_ref()], bump = device.bump)]
    pub device: Account<'info, Device>,
    #[account(
        constraint = device_signer.key() == device.device_pubkey @ VerisError::Unauthorized
    )]
    pub device_signer: Signer<'info>,
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + PhotoRecord::INIT_SPACE,
        seeds = [b"photo", image_hash.as_ref()],
        bump
    )]
    pub photo_record: Account<'info, PhotoRecord>,
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    /// CHECK: validated by address constraint to be the instructions sysvar
    #[account(address = anchor_lang::solana_program::sysvar::instructions::ID)]
    pub instructions_sysvar: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}
