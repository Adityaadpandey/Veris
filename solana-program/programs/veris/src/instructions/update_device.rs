use anchor_lang::prelude::*;

use crate::errors::VerisError;
use crate::events::DeviceUpdated;
use crate::state::Device;

pub fn update_device_handler(
    ctx: Context<UpdateDevice>,
    firmware_version: Option<String>,
    is_active: bool,
) -> Result<()> {
    let signer_key = ctx.accounts.signer.key();
    let device = &mut ctx.accounts.device;
    require!(
        signer_key == device.registered_by || signer_key == device.device_pubkey,
        VerisError::Unauthorized
    );

    if let Some(fw) = firmware_version {
        require!(!fw.is_empty() && fw.len() <= 32, VerisError::InvalidInput);
        device.firmware_version = fw;
    }
    device.is_active = is_active;

    emit!(DeviceUpdated {
        device_pubkey: device.device_pubkey,
        is_active: device.is_active,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct UpdateDevice<'info> {
    #[account(
        mut,
        seeds = [b"device", device.device_pubkey.as_ref()],
        bump = device.bump
    )]
    pub device: Account<'info, Device>,
    pub signer: Signer<'info>,
}
