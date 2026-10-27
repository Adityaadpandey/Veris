use anchor_lang::prelude::*;
use solana_sha256_hasher::hash;

use crate::errors::VerisError;
use crate::events::DeviceRegistered;
use crate::state::{Config, Device, DeviceIdIndex};

pub fn register_device_handler(
    ctx: Context<RegisterDevice>,
    device_pubkey: Pubkey,
    device_id: String,
    camera_id: String,
    model: String,
    firmware_version: String,
) -> Result<()> {
    require!(!device_id.is_empty() && device_id.len() <= 64, VerisError::InvalidInput);
    require!(!camera_id.is_empty() && camera_id.len() <= 64, VerisError::InvalidInput);
    require!(!model.is_empty() && model.len() <= 64, VerisError::InvalidInput);
    require!(
        !firmware_version.is_empty() && firmware_version.len() <= 32,
        VerisError::InvalidInput
    );

    let device = &mut ctx.accounts.device;
    device.device_pubkey = device_pubkey;
    device.device_id = device_id;
    device.camera_id = camera_id;
    device.model = model;
    device.firmware_version = firmware_version;
    device.registered_at = Clock::get()?.unix_timestamp;
    device.is_active = true;
    device.registered_by = ctx.accounts.signer.key();
    device.bump = ctx.bumps.device;

    let index = &mut ctx.accounts.device_id_index;
    index.device_pubkey = device_pubkey;
    index.bump = ctx.bumps.device_id_index;

    let config = &mut ctx.accounts.config;
    config.total_devices = config.total_devices.checked_add(1).unwrap();

    emit!(DeviceRegistered {
        device_pubkey,
        device_id: device.device_id.clone(),
        registered_by: device.registered_by,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(device_pubkey: Pubkey, device_id: String)]
pub struct RegisterDevice<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = signer,
        space = 8 + Device::INIT_SPACE,
        seeds = [b"device", device_pubkey.as_ref()],
        bump
    )]
    pub device: Account<'info, Device>,
    #[account(
        init,
        payer = signer,
        space = 8 + DeviceIdIndex::INIT_SPACE,
        seeds = [b"device-id", hash(device_id.as_bytes()).to_bytes().as_ref()],
        bump
    )]
    pub device_id_index: Account<'info, DeviceIdIndex>,
    #[account(mut)]
    pub signer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
