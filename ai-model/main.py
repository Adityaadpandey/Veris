"""
image_auth_v2.py  -  Image Authenticity Verification using CLIP
----------------------------------------------------------------
Uses CLIP (semantic embeddings) instead of EfficientNet (pixel features).
Same scene = same semantics = high similarity regardless of resolution.

Typical scores:
  Same scene pairs    : 0.78 - 0.95
  Different scene pairs: 0.20 - 0.55

Usage:
  python image_auth_v2.py            # runs diagnose + calibrate + verify
  pip install transformers torch torchvision pillow numpy
"""

import os
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision import transforms
from torch.utils.data import Dataset, DataLoader
from PIL import Image, ImageFilter
import numpy as np

try:
    from transformers import CLIPProcessor, CLIPModel
except ImportError:
    raise ImportError("Run: pip install transformers")


# ------------------------------------------------------------------
#  1. ESP PREPROCESSING
#  Sharpen + auto-contrast the ESP image to reduce quality gap
# ------------------------------------------------------------------

def preprocess_esp(img: Image.Image) -> Image.Image:
    img = img.filter(ImageFilter.SHARPEN)
    arr = np.array(img).astype(np.float32)
    for c in range(3):
        lo, hi = arr[:, :, c].min(), arr[:, :, c].max()
        if hi > lo:
            arr[:, :, c] = (arr[:, :, c] - lo) / (hi - lo) * 255
    return Image.fromarray(arr.clip(0, 255).astype(np.uint8))


# ------------------------------------------------------------------
#  2. CLIP ZERO-SHOT VERIFIER  (no training required)
# ------------------------------------------------------------------

class CLIPVerifier:
    """
    Encodes images with CLIP's vision encoder and compares via cosine sim.
    First run downloads ~600MB of weights (cached after that).
    """

    MODEL_ID = "openai/clip-vit-base-patch32"

    def __init__(self, device: str = "cpu"):
        print(f"Loading CLIP ({self.MODEL_ID})...")
        self.device    = device
        self.model     = CLIPModel.from_pretrained(self.MODEL_ID).to(device).eval()
        self.processor = CLIPProcessor.from_pretrained(self.MODEL_ID)
        print("CLIP ready.\n")

    def _encode(self, img: Image.Image) -> torch.Tensor:
        pixel_values = self.processor(
            images=img, return_tensors="pt"
        ).pixel_values.to(self.device)
        with torch.no_grad():
            vision_out = self.model.vision_model(pixel_values=pixel_values)
            feat = self.model.visual_projection(vision_out.pooler_output)
        return F.normalize(feat, p=2, dim=1)

    def verify(self, dslr_path: str, esp_path: str,
               threshold: float = 0.75) -> dict:
        dslr_img = Image.open(dslr_path).convert("RGB")
        esp_img  = preprocess_esp(Image.open(esp_path).convert("RGB"))

        e1 = self._encode(dslr_img)
        e2 = self._encode(esp_img)
        sim = (e1 * e2).sum().item()

        authentic  = sim >= threshold
        confidence = ("high"   if sim >= 0.90 else
                      "medium" if sim >= threshold else "low")
        return {
            "mode":       "CLIP zero-shot",
            "similarity": round(sim, 4),
            "authentic":  authentic,
            "confidence": confidence,
            "threshold":  threshold,
        }

    def batch_verify(self, pairs: list, threshold: float = 0.75) -> list:
        return [self.verify(d, e, threshold) for d, e in pairs]


# ------------------------------------------------------------------
#  3. DIAGNOSTIC  -  similarity table across all scenes
# ------------------------------------------------------------------

def diagnose(data_dir: str, threshold: float = 0.75,
             device: str = "cpu", verifier=None):
    """
    Print similarity for every scene's DSLR/ESP pair.
    Pass an existing CLIPVerifier to avoid reloading weights.
    Returns the verifier so you can reuse it.
    """
    if verifier is None:
        verifier = CLIPVerifier(device=device)

    scenes = sorted([
        d for d in os.listdir(data_dir)
        if os.path.isdir(os.path.join(data_dir, d))
    ])

    scores = []
    print("-- Per-scene similarity (same scene: DSLR vs ESP) --")
    print(f"{'Scene':<20} {'Similarity':>10} {'Pass':>6}")
    print("-" * 40)
    for scene in scenes:
        dslr_p = os.path.join(data_dir, scene, "dslr.jpg")
        esp_p  = os.path.join(data_dir, scene, "esp.jpg")
        if not (os.path.exists(dslr_p) and os.path.exists(esp_p)):
            print(f"{scene:<20} {'MISSING FILE':>10}")
            continue
        r = verifier.verify(dslr_p, esp_p, threshold=threshold)
        scores.append(r["similarity"])
        flag = "ok" if r["authentic"] else "FAIL"
        print(f"{scene:<20} {r['similarity']:>10.4f} {flag:>6}")

    if scores:
        mean = sum(scores) / len(scores)
        passing = sum(1 for s in scores if s >= threshold)
        print(f"\n  Mean : {mean:.4f}  Min : {min(scores):.4f}"
              f"  Max : {max(scores):.4f}")
        print(f"  Pass : {passing}/{len(scores)} at threshold {threshold}")

    if scores and sum(scores) / len(scores) < 0.65:
        print("\n  [!] Very low similarity. Check:")
        print("      1. ESP and DSLR aimed at the same subject?")
        print("      2. Large time gap between captures?")
        print("      3. ESP images too small (< 32x32 px)?")
        print("      4. Images saved as BGR instead of RGB?")

    return verifier


# ------------------------------------------------------------------
#  4. THRESHOLD CALIBRATION
#  Tests positive pairs (same scene) vs negative pairs (diff scene)
#  and finds the best threshold to separate them.
# ------------------------------------------------------------------

def calibrate_threshold(data_dir: str, device: str = "cpu", verifier=None):
    """
    Automatically finds the threshold that best separates same-scene
    pairs from different-scene pairs.

    Returns (recommended_threshold, verifier).
    """
    if verifier is None:
        verifier = CLIPVerifier(device=device)

    scenes = sorted([
        d for d in os.listdir(data_dir)
        if os.path.isdir(os.path.join(data_dir, d))
    ])

    pos_scores = []
    for scene in scenes:
        dslr_p = os.path.join(data_dir, scene, "dslr.jpg")
        esp_p  = os.path.join(data_dir, scene, "esp.jpg")
        if os.path.exists(dslr_p) and os.path.exists(esp_p):
            r = verifier.verify(dslr_p, esp_p, threshold=0.0)
            pos_scores.append(r["similarity"])

    neg_scores = []
    for i in range(len(scenes)):
        s1 = scenes[i]
        s2 = scenes[(i + 1) % len(scenes)]
        if s1 == s2:
            continue
        dslr_p = os.path.join(data_dir, s1, "dslr.jpg")
        esp_p  = os.path.join(data_dir, s2, "esp.jpg")
        if os.path.exists(dslr_p) and os.path.exists(esp_p):
            r = verifier.verify(dslr_p, esp_p, threshold=0.0)
            neg_scores.append(r["similarity"])

    print("\n-- Threshold calibration --")
    if pos_scores:
        print(f"  Positive (same scene)   mean={sum(pos_scores)/len(pos_scores):.4f}"
              f"  min={min(pos_scores):.4f}  max={max(pos_scores):.4f}")
    if neg_scores:
        print(f"  Negative (diff scene)   mean={sum(neg_scores)/len(neg_scores):.4f}"
              f"  min={min(neg_scores):.4f}  max={max(neg_scores):.4f}")

    recommended = 0.75
    if pos_scores and neg_scores:
        worst_pos = min(pos_scores)
        best_neg  = max(neg_scores)
        gap = worst_pos - best_neg
        print(f"\n  Gap (worst_pos - best_neg) : {gap:.4f}")
        if gap > 0.02:
            recommended = round(best_neg + gap * 0.6, 3)
            print(f"  Recommended threshold      : {recommended}  <-- use this")
        else:
            recommended = round(best_neg + gap * 0.5, 3)
            print(f"  [!] Small gap ({gap:.4f}) - pairs are too close.")
            print(f"      Fine-tune with train_clip() for better separation.")
            print(f"  Cautious threshold         : {recommended}")

    return recommended, verifier


# ------------------------------------------------------------------
#  5. FINE-TUNED MODEL  (best accuracy, needs ~50+ scene pairs)
# ------------------------------------------------------------------

class FineTunedCLIP(nn.Module):
    """
    Frozen CLIP vision encoder + small trainable adapter.
    Only the 256->128 adapter is trained (fast, few-shot friendly).
    """
    MODEL_ID = "openai/clip-vit-base-patch32"

    def __init__(self, embed_dim: int = 128):
        super().__init__()
        base = CLIPModel.from_pretrained(self.MODEL_ID)
        self.clip_vision = base.vision_model
        self.clip_proj   = base.visual_projection
        clip_out = base.config.projection_dim   # 512 for base-patch32

        for p in self.clip_vision.parameters():
            p.requires_grad = False
        for p in self.clip_proj.parameters():
            p.requires_grad = False

        self.adapter = nn.Sequential(
            nn.Linear(clip_out, 256),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(256, embed_dim),
        )

    def encode(self, pixel_values: torch.Tensor) -> torch.Tensor:
        vision_out = self.clip_vision(pixel_values=pixel_values)
        projected  = self.clip_proj(vision_out.pooler_output)
        adapted    = self.adapter(projected)
        return F.normalize(adapted, p=2, dim=1)

    def forward(self, dslr_pix, esp_pix):
        return self.encode(dslr_pix), self.encode(esp_pix)


class InfoNCELoss(nn.Module):
    """
    NT-Xent loss. Pulls paired images together and pushes all
    other images in the same batch apart simultaneously.
    Much stronger than contrastive loss.
    """
    def __init__(self, temperature: float = 0.07):
        super().__init__()
        self.temperature = temperature

    def forward(self, e1: torch.Tensor, e2: torch.Tensor) -> torch.Tensor:
        N   = e1.size(0)
        sim = torch.mm(e1, e2.T) / self.temperature
        labels = torch.arange(N, device=e1.device)
        return (F.cross_entropy(sim, labels) + F.cross_entropy(sim.T, labels)) / 2


# ------------------------------------------------------------------
#  6. DATASET FOR FINE-TUNING
# ------------------------------------------------------------------

class PairDataset(Dataset):
    def __init__(self, root_dir: str, processor: CLIPProcessor):
        self.root_dir  = root_dir
        self.processor = processor
        self.scenes    = sorted([
            d for d in os.listdir(root_dir)
            if os.path.isdir(os.path.join(root_dir, d))
        ])
        print(f"Found {len(self.scenes)} scenes in {root_dir}")

    def __len__(self):
        return len(self.scenes)

    def __getitem__(self, idx):
        scene    = self.scenes[idx]
        dslr_img = Image.open(
            os.path.join(self.root_dir, scene, "dslr.jpg")).convert("RGB")
        esp_img  = preprocess_esp(
            Image.open(
                os.path.join(self.root_dir, scene, "esp.jpg")).convert("RGB"))
        dslr_t = self.processor(
            images=dslr_img, return_tensors="pt").pixel_values.squeeze(0)
        esp_t  = self.processor(
            images=esp_img,  return_tensors="pt").pixel_values.squeeze(0)
        return dslr_t, esp_t


# ------------------------------------------------------------------
#  7. FINE-TUNING LOOP
# ------------------------------------------------------------------

def train_clip(data_dir:   str,
               epochs:     int   = 15,
               batch_size: int   = 16,
               lr:         float = 3e-4,
               device:     str   = "cpu",
               save_path:  str   = "authnet_clip.pth"):

    processor = CLIPProcessor.from_pretrained(FineTunedCLIP.MODEL_ID)
    model     = FineTunedCLIP(embed_dim=128).to(device)
    criterion = InfoNCELoss(temperature=0.07)
    optimizer = torch.optim.AdamW(
        model.adapter.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=epochs)

    dataset   = PairDataset(data_dir, processor)
    val_n     = max(1, int(0.15 * len(dataset)))
    train_ds, val_ds = torch.utils.data.random_split(
        dataset, [len(dataset) - val_n, val_n])

    train_loader = DataLoader(train_ds, batch_size=batch_size,
                              shuffle=True,  num_workers=2)
    val_loader   = DataLoader(val_ds,   batch_size=batch_size,
                              shuffle=False, num_workers=2)

    best_val = float("inf")
    for epoch in range(1, epochs + 1):
        model.train()
        t_loss = 0.0
        for dslr_pix, esp_pix in train_loader:
            dslr_pix, esp_pix = dslr_pix.to(device), esp_pix.to(device)
            optimizer.zero_grad()
            e1, e2 = model(dslr_pix, esp_pix)
            loss = criterion(e1, e2)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.adapter.parameters(), 1.0)
            optimizer.step()
            t_loss += loss.item()
        scheduler.step()

        model.eval()
        v_loss = 0.0
        with torch.no_grad():
            for dslr_pix, esp_pix in val_loader:
                dslr_pix, esp_pix = dslr_pix.to(device), esp_pix.to(device)
                e1, e2 = model(dslr_pix, esp_pix)
                v_loss += criterion(e1, e2).item()

        avg_t = t_loss / len(train_loader)
        avg_v = v_loss / max(len(val_loader), 1)
        print(f"Epoch {epoch:02d}/{epochs}  train={avg_t:.4f}  val={avg_v:.4f}")

        if avg_v < best_val:
            best_val = avg_v
            torch.save(model.adapter.state_dict(), save_path)
            print(f"  Saved best model -> {save_path}")

    print(f"\nTraining done. Best val loss: {best_val:.4f}")
    return model


# ------------------------------------------------------------------
#  8. INFERENCE WITH FINE-TUNED MODEL
# ------------------------------------------------------------------

def trained_clip_verify(dslr_path:    str,
                        esp_path:     str,
                        weights_path: str   = "authnet_clip.pth",
                        threshold:    float = 0.80,
                        device:       str   = "cpu") -> dict:
    if not os.path.exists(weights_path):
        raise FileNotFoundError(
            f"No weights at '{weights_path}'. Run train_clip() first.")

    processor = CLIPProcessor.from_pretrained(FineTunedCLIP.MODEL_ID)
    model = FineTunedCLIP(embed_dim=128).to(device)
    model.adapter.load_state_dict(
        torch.load(weights_path, map_location=device))
    model.eval()

    dslr_img = Image.open(dslr_path).convert("RGB")
    esp_img  = preprocess_esp(Image.open(esp_path).convert("RGB"))

    dslr_t = processor(
        images=dslr_img, return_tensors="pt").pixel_values.to(device)
    esp_t  = processor(
        images=esp_img,  return_tensors="pt").pixel_values.to(device)

    with torch.no_grad():
        e1 = model.encode(dslr_t)
        e2 = model.encode(esp_t)
        sim = (e1 * e2).sum().item()

    authentic  = sim >= threshold
    confidence = ("high"   if sim >= 0.90 else
                  "medium" if sim >= threshold else "low")
    return {
        "mode":       "CLIP fine-tuned",
        "similarity": round(sim, 4),
        "authentic":  authentic,
        "confidence": confidence,
        "threshold":  threshold,
    }


# ------------------------------------------------------------------
#  MAIN
# ------------------------------------------------------------------

if __name__ == "__main__":
    DEVICE   = "cuda" if torch.cuda.is_available() else "cpu"
    DATA_DIR = "./data"
    DSLR     = os.path.join(DATA_DIR, "scene_001", "dslr.jpg")
    ESP      = os.path.join(DATA_DIR, "scene_001", "esp.jpg")

    print(f"Device: {DEVICE}\n")

    # Step 1: load CLIP once and reuse it for all steps
    verifier = CLIPVerifier(device=DEVICE)

    # Step 2: check all scenes
    verifier = diagnose(DATA_DIR, threshold=0.75, verifier=verifier)

    # Step 3: find the right threshold for your data
    threshold, verifier = calibrate_threshold(DATA_DIR, verifier=verifier)

    # Step 4: verify a single pair using the calibrated threshold
    print(f"\n-- Verify scene_001 (threshold={threshold}) --")
    result = verifier.verify(DSLR, ESP, threshold=threshold)
    for k, v in result.items():
        print(f"   {k}: {v}")

    # Step 5: fine-tune once you have 50+ scenes (uncomment when ready)
    train_clip(DATA_DIR, epochs=15, batch_size=16, device=DEVICE)

    # Step 6: use fine-tuned model
    result = trained_clip_verify(DSLR, ESP, threshold=threshold, device=DEVICE)
    for k, v in result.items():
        print(f"   {k}: {v}")
