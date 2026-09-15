import os
from functools import lru_cache
from dotenv import load_dotenv

load_dotenv()


class Settings:
    rpc_url: str
    private_key: str
    contract_address: str
    pinata_api_key: str
    pinata_secret_api_key: str
    hive_api_key: str
    base_url: str

    def __init__(self) -> None:
        self.rpc_url = _require("RPC_URL")
        self.private_key = _require("PRIVATE_KEY")
        self.contract_address = _require("CONTRACT_ADDRESS")
        self.pinata_api_key = _require("PINATA_API_KEY")
        self.pinata_secret_api_key = _require("PINATA_SECRET_API_KEY")
        self.hive_api_key = _require("HIVE_API_KEY")
        self.base_url = os.getenv("BASE_URL", "http://localhost:8000").rstrip("/")
        self.frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")


def _require(key: str) -> str:
    value = os.getenv(key)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {key}")
    return value


@lru_cache()
def get_settings() -> Settings:
    return Settings()
