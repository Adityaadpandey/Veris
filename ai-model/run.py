"""
Minimal image verification test using ImageVerifier
"""

import os
import torch
from main import ImageVerifier

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DATA_DIR = "./data"
DSLR = os.path.join(DATA_DIR, "scene_001", "dslr.jpg")
ESP = os.path.join(DATA_DIR, "scene_001", "esp.jpg")

print(f"Device : {DEVICE}")
print(f"Image 1: {DSLR}")
print(f"Image 2: {ESP}\n")

verifier = ImageVerifier(device=DEVICE)
result = verifier.verify(DSLR, ESP)

print("-- Verification Result --")
for key, value in result.items():
    print(f"  {key}: {value}")
