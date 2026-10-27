use anchor_lang::prelude::*;

pub mod ed25519;
pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("6beFq5WaWo7dPPEzVNt8gRG1YwJiFyUuhzpH1ydVDd23");

#[program]
pub mod veris {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        instructions::initialize::initialize_handler(ctx)
    }

    pub fn register_device(
        ctx: Context<RegisterDevice>,
        device_pubkey: Pubkey,
        device_id: String,
        camera_id: String,
        model: String,
        firmware_version: String,
    ) -> Result<()> {
        instructions::register_device::register_device_handler(
            ctx,
            device_pubkey,
            device_id,
            camera_id,
            model,
            firmware_version,
        )
    }

    pub fn update_device(
        ctx: Context<UpdateDevice>,
        firmware_version: Option<String>,
        is_active: bool,
    ) -> Result<()> {
        instructions::update_device::update_device_handler(ctx, firmware_version, is_active)
    }

    pub fn deactivate_device(ctx: Context<DeactivateDevice>) -> Result<()> {
        instructions::deactivate_device::deactivate_device_handler(ctx)
    }

    pub fn mint_photo(
        ctx: Context<MintPhoto>,
        image_hash: [u8; 32],
        cid: String,
        signature: [u8; 64],
        captured_at: i64,
        max_editions: u64,
        owner: Pubkey,
    ) -> Result<()> {
        instructions::mint_photo::mint_photo_handler(
            ctx,
            image_hash,
            cid,
            signature,
            captured_at,
            max_editions,
            owner,
        )
    }

    pub fn mint_edition(ctx: Context<MintEdition>, recipient: Pubkey) -> Result<()> {
        instructions::mint_edition::mint_edition_handler(ctx, recipient)
    }

    pub fn transfer_photo(ctx: Context<TransferPhoto>, new_owner: Pubkey) -> Result<()> {
        instructions::transfer_photo::transfer_photo_handler(ctx, new_owner)
    }

    pub fn transfer_edition(ctx: Context<TransferEdition>, new_owner: Pubkey) -> Result<()> {
        instructions::transfer_edition::transfer_edition_handler(ctx, new_owner)
    }
}
