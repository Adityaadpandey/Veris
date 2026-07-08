use anchor_lang::prelude::*;

use crate::errors::VerisError;
use crate::events::DeviceUpdated;
use crate::state::Device;

pub fn deactivate_device_handler(ctx: Context<DeactivateDevice>) -> Result<()> {
    let signer_key = ctx.accounts.signer.key();
    let device = &mut ctx.accounts.device;
    require!(
        signer_key == device.registered_by || signer_key == device.device_pubkey,
        VerisError::Unauthorized
    );
    device.is_active = false;

    emit!(DeviceUpdated {
        device_pubkey: device.device_pubkey,
        is_active: false,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct DeactivateDevice<'info> {
    #[account(
        mut,
        seeds = [b"device", device.device_pubkey.as_ref()],
        bump = device.bump
    )]
    pub device: Account<'info, Device>,
    pub signer: Signer<'info>,
}
