use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub total_photos: u64,
    pub total_devices: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Device {
    pub device_pubkey: Pubkey,
    #[max_len(64)]
    pub device_id: String,
    #[max_len(64)]
    pub camera_id: String,
    #[max_len(64)]
    pub model: String,
    #[max_len(32)]
    pub firmware_version: String,
    pub registered_at: i64,
    pub is_active: bool,
    pub registered_by: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct DeviceIdIndex {
    pub device_pubkey: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PhotoRecord {
    pub index: u64,
    pub device_pubkey: Pubkey,
    #[max_len(64)]
    pub device_id: String,
    #[max_len(96)]
    pub cid: String,
    pub image_hash: [u8; 32],
    pub signature: [u8; 64],
    pub captured_at: i64,
    pub minted_at: i64,
    pub max_editions: u64,
    pub edition_count: u64,
    pub owner: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Edition {
    pub photo: Pubkey,
    pub number: u64,
    pub owner: Pubkey,
    pub minted_at: i64,
    pub bump: u8,
}
