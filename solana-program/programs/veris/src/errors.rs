use anchor_lang::prelude::*;

#[error_code]
pub enum VerisError {
    #[msg("Device is not active")]
    DeviceNotActive,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Maximum editions reached")]
    MaxEditionsReached,
    #[msg("Missing ed25519 verification instruction")]
    MissingEd25519Verification,
    #[msg("Ed25519 signature does not match")]
    SignatureMismatch,
    #[msg("Invalid input")]
    InvalidInput,
}
