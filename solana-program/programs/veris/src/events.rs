use anchor_lang::prelude::*;

#[event]
pub struct DeviceRegistered {
    pub device_pubkey: Pubkey,
    pub device_id: String,
    pub registered_by: Pubkey,
}

#[event]
pub struct DeviceUpdated {
    pub device_pubkey: Pubkey,
    pub is_active: bool,
}

#[event]
pub struct PhotoMinted {
    pub photo: Pubkey,
    pub index: u64,
    pub device_pubkey: Pubkey,
    pub image_hash: [u8; 32],
    pub cid: String,
    pub owner: Pubkey,
}

#[event]
pub struct EditionMinted {
    pub edition: Pubkey,
    pub photo: Pubkey,
    pub number: u64,
    pub owner: Pubkey,
}

#[event]
pub struct PhotoTransferred {
    pub photo: Pubkey,
    pub new_owner: Pubkey,
}

#[event]
pub struct EditionTransferred {
    pub edition: Pubkey,
    pub new_owner: Pubkey,
}
