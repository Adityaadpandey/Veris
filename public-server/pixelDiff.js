/**
 * pixelDiff.js
 *
 * Real pixel-level comparison between an upload flagged as an "altered copy"
 * (imageHash tamper tiers structural_edit / possible_match) and the on-chain
 * original it matched against. The hash-based tamper check (imageHash.js)
 * only produces a single opaque distance number; this fetches the actual
 * ground-truth original (which Verify & Search always has, unlike a generic
 * reverse-image search) and measures WHERE and roughly WHAT KIND of edit
 * happened, using block-wise SSIM (structural similarity).
 *
 * CommonJS to match the rest of public-server. Uses `sharp` for decoding.
 */

const sharp = require('sharp');

const CANVAS_SIZE = 256; // working resolution, square, both images forced to fit
const BLOCK_SIZE = 16;   // 256 / 16 = 16x16 grid of blocks
const BLOCKS_PER_SIDE = CANVAS_SIZE / BLOCK_SIZE;
const BLOCK_BAD_THRESHOLD = 0.75;       // per-block SSIM below this counts as "changed"
const GLOBAL_ADJUSTMENT_FRACTION = 0.6; // bad-block fraction at/above this -> whole-frame edit
const ASPECT_RATIO_TOLERANCE = 0.05;    // >5% aspect-ratio difference -> treat as a crop

const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;

async function grayscaleCanvas(buffer) {
  return sharp(buffer)
    .grayscale()
    .resize(CANVAS_SIZE, CANVAS_SIZE, { fit: 'fill' })
    .raw()
    .toBuffer();
}

async function aspectRatio(buffer) {
  const { width, height } = await sharp(buffer).metadata();
  if (!width || !height) return null;
  return width / height;
}

/** SSIM of one BLOCK_SIZE x BLOCK_SIZE block between two equal-size grayscale canvases. */
function blockSsim(a, b, blockRow, blockCol) {
  const startRow = blockRow * BLOCK_SIZE;
  const startCol = blockCol * BLOCK_SIZE;
  let sumA = 0, sumB = 0, n = 0;
  for (let r = 0; r < BLOCK_SIZE; r++) {
    for (let c = 0; c < BLOCK_SIZE; c++) {
      const idx = (startRow + r) * CANVAS_SIZE + (startCol + c);
      sumA += a[idx];
      sumB += b[idx];
      n++;
    }
  }
  const meanA = sumA / n;
  const meanB = sumB / n;

  let varA = 0, varB = 0, covAB = 0;
  for (let r = 0; r < BLOCK_SIZE; r++) {
    for (let c = 0; c < BLOCK_SIZE; c++) {
      const idx = (startRow + r) * CANVAS_SIZE + (startCol + c);
      const da = a[idx] - meanA;
      const db = b[idx] - meanB;
      varA += da * da;
      varB += db * db;
      covAB += da * db;
    }
  }
  varA /= (n - 1);
  varB /= (n - 1);
  covAB /= (n - 1);

  const numerator = (2 * meanA * meanB + C1) * (2 * covAB + C2);
  const denominator = (meanA * meanA + meanB * meanB + C1) * (varA + varB + C2);
  return denominator === 0 ? 1 : numerator / denominator;
}

/**
 * Compare an on-chain original against an uploaded copy that already matched
 * it via perceptual hash (tier structural_edit or possible_match). Caller is
 * responsible for pre-rotating/mirroring `originalBuffer` to the orientation
 * that matched (imageHash.transformForOrientation), so this only ever sees
 * two images that are the SAME way up.
 *
 * @returns {Promise<{ ssim: number, change_type: string, region_bbox: {x:number,y:number,width:number,height:number}|null }>}
 */
async function computeForensicDiff(originalBuffer, uploadBuffer) {
  const [origRatio, uploadRatio] = await Promise.all([
    aspectRatio(originalBuffer),
    aspectRatio(uploadBuffer)
  ]);
  const aspectMismatch = origRatio && uploadRatio
    ? Math.abs(origRatio - uploadRatio) / origRatio > ASPECT_RATIO_TOLERANCE
    : false;

  const [a, b] = await Promise.all([
    grayscaleCanvas(originalBuffer),
    grayscaleCanvas(uploadBuffer)
  ]);

  let sumSsim = 0;
  let badCount = 0;
  let minRow = null, maxRow = null, minCol = null, maxCol = null;
  const totalBlocks = BLOCKS_PER_SIDE * BLOCKS_PER_SIDE;

  for (let row = 0; row < BLOCKS_PER_SIDE; row++) {
    for (let col = 0; col < BLOCKS_PER_SIDE; col++) {
      const score = blockSsim(a, b, row, col);
      sumSsim += score;
      if (score < BLOCK_BAD_THRESHOLD) {
        badCount++;
        minRow = minRow === null ? row : Math.min(minRow, row);
        maxRow = maxRow === null ? row : Math.max(maxRow, row);
        minCol = minCol === null ? col : Math.min(minCol, col);
        maxCol = maxCol === null ? col : Math.max(maxCol, col);
      }
    }
  }

  const ssim = Math.round((sumSsim / totalBlocks) * 1000) / 1000;
  const badFraction = badCount / totalBlocks;

  let changeType;
  let regionBbox = null;
  if (aspectMismatch) {
    changeType = 'crop';
  } else if (badFraction >= GLOBAL_ADJUSTMENT_FRACTION) {
    changeType = 'global_adjustment';
  } else if (badCount > 0) {
    changeType = 'localized_edit';
    regionBbox = {
      x: Math.round((minCol / BLOCKS_PER_SIDE) * 1000) / 1000,
      y: Math.round((minRow / BLOCKS_PER_SIDE) * 1000) / 1000,
      width: Math.round(((maxCol - minCol + 1) / BLOCKS_PER_SIDE) * 1000) / 1000,
      height: Math.round(((maxRow - minRow + 1) / BLOCKS_PER_SIDE) * 1000) / 1000
    };
  } else {
    changeType = 'recompression';
  }

  return { ssim, change_type: changeType, region_bbox: regionBbox };
}

// ── Fine-grained change regions ────────────────────────────────────────────
// The 16x16 SSIM grid above is deliberately coarse, so a small edit (a tiny
// distant person, a small object, a few pixels) vanishes inside a block. This
// pass works at higher resolution on a lightly blurred colour diff, so JPEG
// noise is absorbed but small genuine edits survive.
const FINE_SIZE = 512;
const FINE_BLUR_SIGMA = 1.5;
const FINE_DIFF_THRESHOLD = 26;     // 0-255 blurred per-channel difference that counts as changed
const FINE_MIN_AREA = 8;            // px at 512x512 (~0.003% of the frame)
const FINE_MERGE_GAP = 14;          // boxes closer than this (px) are one region
const FINE_MAX_GLOBAL_FRACTION = 0.35; // more than this changed -> whole-frame edit, no regions
const FINE_MAX_REGIONS = 6;

async function fineCanvas(buffer) {
  return sharp(buffer)
    .removeAlpha()
    .resize(FINE_SIZE, FINE_SIZE, { fit: 'fill' })
    .blur(FINE_BLUR_SIGMA)
    .raw()
    .toBuffer();
}

function mergeBoxes(boxes) {
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.x0 - FINE_MERGE_GAP <= b.x1 && b.x0 - FINE_MERGE_GAP <= a.x1
          && a.y0 - FINE_MERGE_GAP <= b.y1 && b.y0 - FINE_MERGE_GAP <= a.y1) {
          boxes[i] = {
            x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
            x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1),
            area: a.area + b.area, peak: Math.max(a.peak, b.peak)
          };
          boxes.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return boxes;
}

/** Plain-English position of a normalised box centre, e.g. "upper left". */
function describePosition(cx, cy) {
  const v = cy < 0.34 ? 'upper' : cy > 0.66 ? 'lower' : 'middle';
  const h = cx < 0.34 ? 'left' : cx > 0.66 ? 'right' : 'center';
  if (v === 'middle' && h === 'center') return 'center';
  if (v === 'middle') return h;
  if (h === 'center') return v === 'upper' ? 'top' : 'bottom';
  return `${v} ${h}`;
}

/**
 * Find small localized differences between the original and an upload.
 * @returns {Promise<Array<{x:number,y:number,width:number,height:number,area_fraction:number,position:string}>>}
 *   normalised (0-1) boxes, largest first. Empty for identical / re-encoded images,
 *   whole-frame adjustments, or crops (different aspect ratio).
 */
async function findChangeRegions(originalBuffer, uploadBuffer) {
  const [origRatio, uploadRatio] = await Promise.all([aspectRatio(originalBuffer), aspectRatio(uploadBuffer)]);
  if (origRatio && uploadRatio && Math.abs(origRatio - uploadRatio) / origRatio > ASPECT_RATIO_TOLERANCE) return [];

  const [a, b] = await Promise.all([fineCanvas(originalBuffer), fineCanvas(uploadBuffer)]);
  const n = FINE_SIZE * FINE_SIZE;

  // Remove any global brightness/colour shift so only local edits stand out.
  const offset = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += b[i * 3 + c] - a[i * 3 + c];
    offset[c] = sum / n;
  }

  const strength = new Uint8Array(n);
  const mask = new Uint8Array(n);
  let changed = 0;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(b[i * 3 + c] - a[i * 3 + c] - offset[c]);
      if (d > m) m = d;
    }
    strength[i] = m > 255 ? 255 : m;
    if (m > FINE_DIFF_THRESHOLD) { mask[i] = 1; changed++; }
  }
  if (changed === 0 || changed / n > FINE_MAX_GLOBAL_FRACTION) return [];

  // 8-connected components via an iterative flood fill.
  const stack = new Int32Array(n);
  let boxes = [];
  for (let start = 0; start < n; start++) {
    if (mask[start] !== 1) continue;
    let sp = 0;
    stack[sp++] = start;
    mask[start] = 2;
    let x0 = FINE_SIZE, y0 = FINE_SIZE, x1 = 0, y1 = 0, area = 0, peak = 0;
    while (sp > 0) {
      const idx = stack[--sp];
      const x = idx % FINE_SIZE, y = (idx - x) / FINE_SIZE;
      area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (strength[idx] > peak) peak = strength[idx];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= FINE_SIZE || ny >= FINE_SIZE) continue;
          const ni = ny * FINE_SIZE + nx;
          if (mask[ni] === 1) { mask[ni] = 2; stack[sp++] = ni; }
        }
      }
    }
    if (area >= FINE_MIN_AREA) boxes.push({ x0, y0, x1, y1, area, peak });
  }

  boxes = mergeBoxes(boxes).sort((p, q) => q.area - p.area).slice(0, FINE_MAX_REGIONS);
  const r = (v) => Math.round(v * 1000) / 1000;
  return boxes.map((bx) => {
    const x = bx.x0 / FINE_SIZE, y = bx.y0 / FINE_SIZE;
    const width = (bx.x1 - bx.x0 + 1) / FINE_SIZE, height = (bx.y1 - bx.y0 + 1) / FINE_SIZE;
    return {
      x: r(x), y: r(y), width: r(width), height: r(height),
      area_fraction: r(bx.area / n),
      position: describePosition(x + width / 2, y + height / 2)
    };
  });
}

/** Crop a normalised box (with padding) out of an image; returns a JPEG buffer. */
async function cropRegion(buffer, box, padding = 0.04) {
  const { width, height } = await sharp(buffer).metadata();
  const left = Math.max(0, Math.floor((box.x - padding) * width));
  const top = Math.max(0, Math.floor((box.y - padding) * height));
  const right = Math.min(width, Math.ceil((box.x + box.width + padding) * width));
  const bottom = Math.min(height, Math.ceil((box.y + box.height + padding) * height));
  return sharp(buffer)
    .extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) })
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: false })
    .jpeg({ quality: 90 })
    .toBuffer();
}

module.exports = { computeForensicDiff, findChangeRegions, cropRegion };
