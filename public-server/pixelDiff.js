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

module.exports = { computeForensicDiff };
