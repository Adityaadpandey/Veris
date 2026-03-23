import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import photos

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)

app = FastAPI(
    title="LensMint API",
    description="Photo authenticity system — Raspberry Pi → AI scoring → IPFS → Base L2 NFT",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(photos.router)


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "service": "LensMint API"}
