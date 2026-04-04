"""
Minimal image similarity test using CLIPVerifier
"""

import os
import torch

from main import CLIPVerifier

# Device setup
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# Image paths
DATA_DIR = "./data"
DSLR = os.path.join(DATA_DIR, "scene_001", "dslr.jpg")
ESP  = os.path.join(DATA_DIR, "scene_001", "esp.jpg")

print(f"Device : {DEVICE}")
print(f"Image 1: {DSLR}")
print(f"Image 2: {ESP}\n")

# Load model
verifier = CLIPVerifier(device=DEVICE)

# Run similarity check
result = verifier.verify(DSLR, ESP)

# Print results
print("-- Similarity Result --")
for key, value in result.items():
    print(f"{key}: {value}")
