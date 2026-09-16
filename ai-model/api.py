"""
api.py - HTTP API in front of ImageVerifier.

main.py has no server of its own -- it's a script (diagnose + calibrate on
./data). This wraps the same ImageVerifier in a tiny FastAPI service so the
owner-portal frontend can POST two images and get a verification result
back, without porting the CV/ML stack to Node.

Run:
  uvicorn api:app --host 0.0.0.0 --port 8000
"""

import os
import tempfile

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from main import ImageVerifier

app = FastAPI(title="Veris Image Verifier")

# Vite picks whatever port is free (3000, 3001, 3002, ...), so pinning one
# port as the CORS default breaks the moment something else is already on
# it. Without an explicit CORS_ORIGINS, allow any localhost/127.0.0.1 port
# -- still scoped to local dev, not a real wildcard. Set CORS_ORIGINS to an
# explicit comma-separated list for production.
_cors_origins_env = os.environ.get("CORS_ORIGINS")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins_env.split(",") if _cors_origins_env else [],
    allow_origin_regex=None if _cors_origins_env else r"http://(localhost|127\.0\.0\.1):\d+",
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

# Loaded once at process startup -- CLIP weights (if ENABLE_CLIP=1) and the
# OpenAI client are expensive enough that re-creating them per request would
# make every call pay for model load time on top of the actual verification.
verifier = ImageVerifier(device="cpu")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "vision_signal_enabled": verifier.openai is not None,
        "clip_signal_enabled": verifier.clip is not None,
    }


@app.post("/api/verify")
async def verify(
    companion: UploadFile = File(..., description="Candidate photo being checked"),
    truth: UploadFile = File(..., description="Hardware-verified source-of-truth photo"),
):
    for f in (companion, truth):
        if not (f.content_type or "").startswith("image/"):
            raise HTTPException(400, f"'{f.filename}' is not an image file")

    with tempfile.TemporaryDirectory() as tmp_dir:
        companion_path = os.path.join(tmp_dir, f"companion_{companion.filename}")
        truth_path = os.path.join(tmp_dir, f"truth_{truth.filename}")

        with open(companion_path, "wb") as fh:
            fh.write(await companion.read())
        with open(truth_path, "wb") as fh:
            fh.write(await truth.read())

        try:
            return verifier.verify(companion_path, truth_path)
        except Exception as e:
            raise HTTPException(500, f"Verification failed: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
