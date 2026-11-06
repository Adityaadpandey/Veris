/**
 * openaiService.js
 *
 * Wraps the OpenAI REST API for the Veris claim server.
 *
 * Two-stage pipeline used across the app:
 *   1. GPT vision describes an image (rich description + short caption + tags)
 *   2. text-embedding-3-small embeds that description into a vector
 *
 * The description powers richer NFT metadata; the embedding powers semantic
 * "find similar photos" search. Everything runs through a small sequential
 * queue so backfill / enrichment bursts don't blow past OpenAI rate limits.
 *
 * CommonJS + native fetch (Node 18+) to match the rest of public-server.
 */

const OPENAI_API_BASE = "https://api.openai.com/v1";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const VISION_MODEL = process.env.OPENAI_VISION_MODEL || "gpt-4.1-mini";
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
const EMBED_DIM = parseInt(process.env.OPENAI_EMBED_DIM || "1536", 10);
const REQUEST_TIMEOUT_MS = parseInt(process.env.OPENAI_TIMEOUT || "30000", 10);

const DESCRIBE_PROMPT =
  "You are analyzing a photograph for a verifiable-photo index. " +
  "Write a detailed, factual description of what the photo shows: subjects, " +
  "setting, colors, lighting, mood, and any notable objects or text. Also " +
  "produce a short one-line caption and a list of concise lowercase tags " +
  "(single words or short phrases) covering the main subjects and themes. " +
  "Finally, give a NON-AUTHORITATIVE visual assessment of whether the image " +
  "looks AI-generated or digitally manipulated: set likely_ai_generated to " +
  "true only if there are clear visual artifacts (impossible anatomy, warped " +
  "text, inconsistent lighting/shadows, blended edges), otherwise false, and " +
  "briefly justify it in ai_assessment. This is only a visual hint, not proof.";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    description: { type: "string" },
    caption: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    likely_ai_generated: { type: "boolean" },
    ai_assessment: { type: "string" },
  },
  required: [
    "description",
    "caption",
    "tags",
    "likely_ai_generated",
    "ai_assessment",
  ],
  additionalProperties: false,
};

// Prompt + schema for comparing a flagged "altered copy" against its on-chain
// original. first image = verified original, second image = the uploaded copy.
const COMPARE_PROMPT =
  "You are shown two photographs of the SAME scene. The first is the verified, " +
  "ORIGINAL on-chain photo. The second is the ALTERED COPY, flagged as the same " +
  "source image but NOT byte-identical. Carefully compare the altered copy against the original and " +
  "report ONLY concrete, observable differences in the altered copy: added/removed/moved " +
  "objects, edited or cloned regions, changed text, altered colors/brightness, " +
  "cropping or resizing, and any signs of AI generation or splicing (warped " +
  "text, impossible edges, inconsistent lighting/shadows). List each concrete " +
  'change as a short phrase in "changes". If the two look visually identical ' +
  "and the only difference is likely re-saving/compression, return an empty " +
  'changes array and set change_type to "reencoded". Choose change_type from: ' +
  '"reencoded", "cropped_or_resized", "color_or_exposure_edit", ' +
  '"content_edited", "ai_modified", "unknown". Write a one-line "summary". ' +
  "Your text is shown to non-technical people: always call them \"the original\" and " +
  "\"the altered copy\", and never write \"image A\", \"image B\", \"A\" or \"B\". " +
  "Look closely for SMALL changes too: a tiny or distant person, a small object, " +
  "a few pixels, a small blemish or logo that was added, removed or cloned out. " +
  "If extra close-up crops are provided, each pair (original crop, then uploaded crop) " +
  "shows an area where pixel differences were detected: describe what is different " +
  "in each pair (for example 'a person in the background was removed') and do not " +
  "dismiss them as compression. " +
  "This is a best-effort visual assessment, not cryptographic proof.";

const COMPARE_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    changes: { type: "array", items: { type: "string" } },
    change_type: { type: "string" },
  },
  required: ["summary", "changes", "change_type"],
  additionalProperties: false,
};

// L2-normalize a vector. OpenAI's embeddings are unit-length at their native
// dimension, but requesting a truncated `dimensions` value (Matryoshka
// truncation) is NOT unit-length afterwards, so we normalize ourselves; this
// also lets stored vectors be compared with a plain dot product if needed.
function l2normalize(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function postJson(url, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      throw new Error(`OpenAI API error: ${msg}`);
    }
    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`OpenAI request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function imageDataUrl(imageBuffer, mimeType) {
  return `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
}

// Safety net: never show "Image A/B" to someone just verifying a photo.
function friendlyLabels(text) {
  return text
    .replace(/\b(?:image|photo|picture)\s*A\b/gi, "the original")
    .replace(/\b(?:image|photo|picture)\s*B\b/gi, "the altered copy");
}

const LIVENESS_PROMPT =
  "You check photos from a tamper-evident camera. The first image is the device photo" +
  " and the optional second image is a phone photo taken at the same moment next to it." +
  " Decide: live = true only if the first image looks like a real scene photographed directly" +
  " (false for a photo of a screen, a printed photo, or an AI-generated image)." +
  " consistent = true only if both images show the same real scene (omit or false without a second image)." +
  ' Reply with JSON only: {"live": boolean, "consistent": boolean, "confidence": number 0 to 1, "reasons": [short strings]}.';

class OpenAIService {
  constructor() {
    // Sequential queue: each task waits for the previous to settle.
    this._queue = Promise.resolve();
  }

  isAvailable() {
    return Boolean(OPENAI_API_KEY);
  }

  get config() {
    return {
      visionModel: VISION_MODEL,
      embedModel: EMBED_MODEL,
      dim: EMBED_DIM,
    };
  }

  /** Run a task through the sequential rate-limit queue. */
  _enqueue(taskFn) {
    const run = this._queue.then(taskFn, taskFn);
    // Keep the chain alive even if a task rejects.
    this._queue = run.catch(() => {});
    return run;
  }

  async describeImage(imageBuffer, mimeType = "image/jpeg") {
    if (!this.isAvailable())
      throw new Error("OPENAI_API_KEY is not configured");
    const url = `${OPENAI_API_BASE}/chat/completions`;
    const body = {
      model: VISION_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: DESCRIBE_PROMPT },
            {
              type: "image_url",
              image_url: { url: imageDataUrl(imageBuffer, mimeType) },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "image_description",
          strict: true,
          schema: RESPONSE_SCHEMA,
        },
      },
    };

    const data = await postJson(url, body);
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) throw new Error("OpenAI vision returned no content");

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("OpenAI vision returned malformed JSON");
    }
    const description = (parsed.description || "").trim();
    if (!description)
      throw new Error("OpenAI vision returned an empty description");
    const caption = (parsed.caption || "").trim();
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)
      : [];
    const likelyAiGenerated = Boolean(parsed.likely_ai_generated);
    const aiAssessment = (parsed.ai_assessment || "").trim();
    return { description, caption, tags, likelyAiGenerated, aiAssessment };
  }

  /**
   * Is this a real scene photographed live, or a screen / print / generated image? With a second
   * (companion) photo it also says whether both show the same scene. Same JSON shape the device
   * gets from the 0G check, so the camera treats both engines alike.
   * @returns { live, consistent (null without a companion), confidence 0..1, reasons: string[] }
   */
  async assessLiveness(deviceBuffer, companionBuffer = null, mimeType = "image/jpeg") {
    if (!this.isAvailable()) throw new Error("OPENAI_API_KEY is not configured");
    const content = [{ type: "text", text: LIVENESS_PROMPT }];
    for (const buf of [deviceBuffer, companionBuffer]) {
      if (buf) content.push({ type: "image_url", image_url: { url: imageDataUrl(buf, mimeType) } });
    }
    const data = await postJson(`${OPENAI_API_BASE}/chat/completions`, {
      model: VISION_MODEL,
      messages: [{ role: "user", content }],
      response_format: { type: "json_object" },
    });
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) throw new Error("OpenAI vision returned no content");
    const parsed = JSON.parse(raw);
    return {
      live: Boolean(parsed.live),
      consistent: companionBuffer ? Boolean(parsed.consistent) : null,
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String).slice(0, 5) : [],
    };
  }

  /**
   * Compare an "altered copy" against its verified on-chain original and
   * describe what changed. Best-effort / non-authoritative. Runs through the
   * sequential rate-limit queue.
   * @returns { summary, changes: string[], changeType }
   */
  async compareImages(originalBuffer, suspectBuffer, mimeType = "image/jpeg", regionCrops = []) {
    return this._enqueue(async () => {
      if (!this.isAvailable())
        throw new Error("OPENAI_API_KEY is not configured");
      const url = `${OPENAI_API_BASE}/chat/completions`;
      const body = {
        model: VISION_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: COMPARE_PROMPT },
              { type: "text", text: "The ORIGINAL photo (verified on-chain):" },
              {
                type: "image_url",
                image_url: { url: imageDataUrl(originalBuffer, mimeType), detail: "high" },
              },
              { type: "text", text: "The ALTERED COPY (uploaded photo to inspect):" },
              {
                type: "image_url",
                image_url: { url: imageDataUrl(suspectBuffer, mimeType), detail: "high" },
              },
              ...regionCrops.flatMap((r, i) => [
                { type: "text", text: `Close-up ${i + 1} (${r.position} of the photo) - ORIGINAL:` },
                { type: "image_url", image_url: { url: imageDataUrl(r.original, "image/jpeg") } },
                { type: "text", text: `Close-up ${i + 1} - ALTERED COPY:` },
                { type: "image_url", image_url: { url: imageDataUrl(r.upload, "image/jpeg") } },
              ]),
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "image_comparison",
            strict: true,
            schema: COMPARE_SCHEMA,
          },
        },
      };
      const data = await postJson(url, body);
      const raw = data?.choices?.[0]?.message?.content;
      if (!raw) throw new Error("OpenAI comparison returned no content");
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("OpenAI comparison returned malformed JSON");
      }
      const changes = Array.isArray(parsed.changes)
        ? parsed.changes.map((c) => friendlyLabels(String(c).trim())).filter(Boolean)
        : [];
      return {
        summary: friendlyLabels((parsed.summary || "").trim()),
        changes,
        changeType: (parsed.change_type || "unknown").trim(),
      };
    });
  }

  async embedText(text) {
    if (!this.isAvailable())
      throw new Error("OPENAI_API_KEY is not configured");
    if (!text || !text.trim()) throw new Error("Cannot embed empty text");
    const url = `${OPENAI_API_BASE}/embeddings`;
    const body = {
      model: EMBED_MODEL,
      input: text,
      dimensions: EMBED_DIM,
    };
    const data = await postJson(url, body);
    const values = data?.data?.[0]?.embedding;
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error("OpenAI embedding returned no vector");
    }
    // Truncated (dimensions < native) embeddings are not unit-length;
    // normalize for correct cosine behaviour and consistent stored vectors.
    return l2normalize(values);
  }

  /**
   * Full pipeline: describe an image then embed the description.
   * Runs through the sequential queue.
   */
  async processImage(imageBuffer, mimeType = "image/jpeg") {
    return this._enqueue(async () => {
      const { description, caption, tags, likelyAiGenerated, aiAssessment } =
        await this.describeImage(imageBuffer, mimeType);
      // Embed a content-dense string (caption + tags) rather than the full
      // prose description. Prose shares boilerplate ("the photograph shows…",
      // colours, "lighting") across unrelated images, which inflates cosine
      // similarity. Caption + tags carry the distinguishing subject matter.
      const embedInput =
        [caption, tags.join(", ")].filter(Boolean).join(". ") || description;
      const embedding = await this.embedText(embedInput);
      return {
        description,
        caption,
        tags,
        likelyAiGenerated,
        aiAssessment,
        embedding,
        model: `${VISION_MODEL}+${EMBED_MODEL}`,
        dim: embedding.length,
      };
    });
  }
}

module.exports = new OpenAIService();
module.exports.cosineSimilarity = cosineSimilarity;
