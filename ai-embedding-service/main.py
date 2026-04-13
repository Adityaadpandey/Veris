"""
ai-embedding-service - FastAPI wrapper for CLIP + pHash embedding generation.
Used by hardware-web3-service to generate and search image embeddings.

Run: uvicorn main:app --port 5001
"""

import io
import sys
import os

import torch
import torch.nn.functional as F
import imagehash
import numpy as np
from PIL import Image
from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse
from transformers import CLIPProcessor, CLIPModel

app = FastAPI(title="Veris Embedding Service")

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
MODEL_ID = "openai/clip-vit-base-patch32"

print(f"Loading CLIP model ({MODEL_ID}) on {DEVICE}...")
_model = CLIPModel.from_pretrained(MODEL_ID).to(DEVICE).eval()
_processor = CLIPProcessor.from_pretrained(MODEL_ID)
print("CLIP model ready.")


def _clip_embedding(img: Image.Image) -> list[float]:
    pixel_values = _processor(images=img, return_tensors="pt").pixel_values.to(DEVICE)
    with torch.no_grad():
        vision_out = _model.vision_model(pixel_values=pixel_values)
        feat = _model.visual_projection(vision_out.pooler_output)
    feat = F.normalize(feat, p=2, dim=1)
    return feat[0].cpu().tolist()


def _phash(img: Image.Image) -> str:
    return str(imagehash.phash(img, hash_size=8))


@app.get("/health")
def health():
    return {"status": "ok", "device": DEVICE}


@app.post("/embed")
async def embed(image: UploadFile = File(...)):
    """
    Accept an image file, return CLIP embedding vector + pHash string.
    Response: { "clip": [...512 floats], "phash": "hexstring" }
    """
    contents = await image.read()
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception as e:
        return JSONResponse(status_code=400, content={"error": f"Cannot read image: {e}"})

    clip_vec = _clip_embedding(img)
    phash_str = _phash(img)

    return JSONResponse({"clip": clip_vec, "phash": phash_str})
