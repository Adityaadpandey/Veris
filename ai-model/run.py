"""
Minimal image verification test using ImageVerifier
"""

import os
from main import ImageVerifier, ENABLE_CLIP

if ENABLE_CLIP:
    import torch
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
else:
    DEVICE = "cpu"
DATA_DIR = "./data"
# DSLR = os.path.join(DATA_DIR, "scene_001", "a.jpeg")
# ESP = os.path.join(DATA_DIR, "scene_001", "ras1.jpeg")

DSLR = os.path.join(DATA_DIR, "scene_001", "b.jpeg")
ESP = os.path.join(DATA_DIR, "scene_001", "ras2.jpeg")


print(f"Device : {DEVICE}")
print(f"Image 1: {DSLR}")
print(f"Image 2: {ESP}\n")

verifier = ImageVerifier(device=DEVICE)
result = verifier.verify(DSLR, ESP)

print("-- Verification Result --")
for key, value in result.items():
    print(f"  {key}: {value}")
