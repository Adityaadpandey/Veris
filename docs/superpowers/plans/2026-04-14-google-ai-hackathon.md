# Veris × Google AI — Hackathon Implementation Plan

**Goal:** Wire Gemini into the existing Veris pipeline in the two most judge-visible places (verification + search) and ship it live on Google Cloud.

**Architecture:** Add `@google/genai` to `hardware-web3-service`. Gemini 2.5 Flash does a consistency check on every verify call and is stored in the NFT metadata. Gemini multimodal embeddings replace CLIP for `/api/search`, enabling both image and text queries. Deploy via Cloud Run (backends) and Firebase Hosting (owner-portal).

**Tech Stack:** Node 20, `@google/genai`, existing Express + SQLite + ethers stack, Cloud Run, Firebase Hosting.

---

## Task 0 — Google Cloud project setup (one-time, ~15 min)

- [ ] Create / pick a GCP project. Enable APIs: **Generative Language API** (for Gemini), **Cloud Run Admin API**, **Artifact Registry API**.
- [ ] Get a Gemini API key from https://aistudio.google.com/app/apikey
- [ ] Install Firebase CLI: `npm i -g firebase-tools` and run `firebase login`
- [ ] Install gcloud CLI, run `gcloud auth login` and `gcloud config set project <project-id>`
- [ ] Add to `hardware-web3-service/.env`:
  ```
  GEMINI_API_KEY=...
  ```

---

## Task 1 — Add Gemini SDK to backend

**Files:** `hardware-web3-service/package.json`, `hardware-web3-service/geminiService.js` (new)

- [ ] Install: `cd hardware-web3-service && npm i @google/genai`

- [ ] Create `hardware-web3-service/geminiService.js`:

```js
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function embedImage(imageBuffer, mimeType = 'image/jpeg') {
  const res = await ai.models.embedContent({
    model: 'gemini-embedding-001',
    contents: [{ parts: [{ inlineData: { mimeType, data: imageBuffer.toString('base64') } }] }],
  });
  return res.embeddings[0].values; // 3072d vector
}

export async function embedText(text) {
  const res = await ai.models.embedContent({
    model: 'gemini-embedding-001',
    contents: [{ parts: [{ text }] }],
  });
  return res.embeddings[0].values;
}

export async function consistencyCheck({ dslrImage, espImage, sensorBundle }) {
  const prompt = `You are a forensic image verifier. Given two images (DSLR and ESP32 companion) that were supposedly captured at the same moment, plus a sensor bundle, decide whether the pixels agree with the sensor data. Flag: mismatched lighting vs timestamp, mismatched scene vs GPS, AI-generation artifacts, digital tampering.

Sensor bundle:
${JSON.stringify(sensorBundle, null, 2)}

Respond in strict JSON matching the schema.`;

  const res = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{
      parts: [
        { text: prompt },
        { inlineData: { mimeType: 'image/jpeg', data: dslrImage.toString('base64') } },
        { inlineData: { mimeType: 'image/jpeg', data: espImage.toString('base64') } },
      ],
    }],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          same_scene: { type: 'boolean' },
          consistency_score: { type: 'number' },
          ai_generation_score: { type: 'number' },
          anomalies: { type: 'array', items: { type: 'string' } },
          reasoning: { type: 'string' },
        },
        required: ['same_scene', 'consistency_score', 'ai_generation_score', 'anomalies', 'reasoning'],
      },
    },
  });
  return JSON.parse(res.text);
}
```

- [ ] Smoke test: `node -e "import('./geminiService.js').then(m => m.embedText('hello').then(v => console.log(v.length)))"` — expect `3072`.

- [ ] Commit: `git add hardware-web3-service/package.json hardware-web3-service/package-lock.json hardware-web3-service/geminiService.js && git commit -m "feat: add Gemini service wrapper"`

---

## Task 2 — Swap CLIP embeddings for Gemini in search path

**Files:** `hardware-web3-service/embeddingService.js`, `hardware-web3-service/server.js`

- [ ] In `embeddingService.js`, replace the CLIP HTTP call with `embedImage()` from `geminiService.js`. Keep the pHash logic. Keep the `cosineSimilarity()` helper. Update the vector length constant to 3072.

- [ ] In `server.js`, update `/api/search`:
  - If request has `image` (multipart) → `embedImage(buffer)`
  - If request has `q` (string) → `embedText(q)` — **this is the new text-query feature**
  - Run cosine against all stored embeddings in SQLite (existing loop is fine for hackathon scale)
  - Return top 5 matches with score ≥ 0.60

- [ ] On every `/api/ingest` / mint, also compute `embedImage()` of the primary image and store the vector as JSON in a new `gemini_embedding TEXT` column. Add an idempotent `ALTER TABLE images ADD COLUMN gemini_embedding TEXT` at service startup.

- [ ] Test locally: upload an image via the owner-portal SearchPage, then query by text (`curl -X POST localhost:5000/api/search -H 'Content-Type: application/json' -d '{"q":"sunset"}'`) and confirm it returns matches.

- [ ] Commit: `git commit -am "feat: use Gemini multimodal embeddings for search (image + text)"`

---

## Task 3 — Add `/verify` endpoint with Gemini consistency signal

**Files:** `hardware-web3-service/server.js`, `hardware-web3-service/verifyFlow.js` (new)

- [ ] Create `hardware-web3-service/verifyFlow.js`:

```js
import { embedImage, consistencyCheck } from './geminiService.js';
import { cosineSimilarity, phashHamming } from './embeddingService.js';

export async function verifyCapture({ dslrImage, espImage, sensorBundle }) {
  const [dslrEmb, espEmb, gemini] = await Promise.all([
    embedImage(dslrImage),
    embedImage(espImage),
    consistencyCheck({ dslrImage, espImage, sensorBundle }),
  ]);

  const cos = cosineSimilarity(dslrEmb, espEmb);
  const phash = 1 - phashHamming(dslrImage, espImage) / 64;

  const final = Math.max(0, Math.min(1,
    0.30 * cos + 0.10 * phash + 0.60 * gemini.consistency_score
      - Math.max(0, gemini.ai_generation_score - 0.5) * 2
  ));

  const verdict = final >= 0.80 ? 'authentic' : final >= 0.50 ? 'suspicious' : 'fake';

  return {
    verdict,
    final,
    signals: { cos, phash, gemini },
  };
}
```

- [ ] In `server.js`, add:

```js
import multer from 'multer';
import { verifyCapture } from './verifyFlow.js';

const upload = multer();
app.post('/api/verify',
  upload.fields([{ name: 'dslr' }, { name: 'esp' }]),
  async (req, res) => {
    try {
      const result = await verifyCapture({
        dslrImage: req.files.dslr[0].buffer,
        espImage: req.files.esp[0].buffer,
        sensorBundle: JSON.parse(req.body.sensorBundle),
      });
      res.json(result);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message });
    }
  }
);
```

- [ ] Also call `verifyCapture` inside the existing mint flow and save `result` as JSON in a new `verdict TEXT` column on the images table.

- [ ] Manual test with two real images and a fake sensor bundle that contradicts the scene — confirm verdict is `suspicious` and `anomalies[]` is populated.

- [ ] Commit: `git commit -am "feat: add /verify endpoint with Gemini consistency check"`

---

## Task 4 — Owner portal: show verdict + anomalies on NFT page

**Files:** `owner-portal/src/components/ClaimPage.jsx` (or the NFT detail page)

- [ ] After the existing metadata fetch, read `verdict` from the image record and render:

```jsx
{verdict && (
  <div className="rounded-lg border p-4 mt-4">
    <div className="flex items-center gap-2">
      <span className={`px-2 py-1 rounded text-xs font-bold ${
        verdict.verdict === 'authentic' ? 'bg-green-600' :
        verdict.verdict === 'suspicious' ? 'bg-yellow-600' : 'bg-red-600'
      } text-white`}>
        {verdict.verdict.toUpperCase()}
      </span>
      <span className="text-sm text-gray-400">
        score {(verdict.final * 100).toFixed(0)}%
      </span>
    </div>
    <p className="text-sm mt-2 text-gray-300">{verdict.signals.gemini.reasoning}</p>
    {verdict.signals.gemini.anomalies?.length > 0 && (
      <ul className="mt-2 text-xs text-yellow-400 list-disc ml-4">
        {verdict.signals.gemini.anomalies.map((a, i) => <li key={i}>{a}</li>)}
      </ul>
    )}
  </div>
)}
```

- [ ] Enable text search on `SearchPage.jsx`: add a text input, on submit POST `{ q: text }` to `/api/search`.

- [ ] `cd owner-portal && npm run dev` — browse to a minted token and confirm the verdict block renders. Try a text search like "sunset" and confirm results.

- [ ] Commit: `git commit -am "feat(portal): show Gemini verdict + enable text search"`

---

## Task 5 — Update search path in SearchPage to send text queries

**Files:** `owner-portal/src/components/SearchPage.jsx`

- [ ] Add a tabs UI: "By Image" (existing upload) vs "By Text" (new input).
- [ ] On text submit: `fetch('/api/search', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ q: text }) })`.
- [ ] Show the same result cards as image search.
- [ ] Commit: `git commit -am "feat(portal): add text search tab"`

---

## Task 6 — Dockerize backends for Cloud Run

**Files:** `hardware-web3-service/Dockerfile` (new), `public-server/Dockerfile` (new), `.dockerignore` in each

- [ ] Create `hardware-web3-service/Dockerfile`:

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
```

- [ ] Make sure `server.js` binds to `process.env.PORT || 5000` (check and fix if hardcoded).

- [ ] Add `.dockerignore`:
```
node_modules
.env
*.db
```

- [ ] Repeat for `public-server/` (same Dockerfile, adjust as needed).

- [ ] Commit: `git commit -am "build: add Dockerfiles for Cloud Run"`

---

## Task 7 — Deploy backends to Cloud Run

- [ ] Deploy hardware-web3-service:

```bash
cd hardware-web3-service
gcloud run deploy veris-web3 \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY=...,PRIVY_APP_ID=...,RPC_URL=... \
  --memory 1Gi
```

- [ ] Deploy public-server similarly as `veris-public`.

- [ ] Note the two Cloud Run URLs — hit `/api/search` on the new URL and confirm it works.

---

## Task 8 — Deploy owner-portal to Firebase Hosting

**Files:** `owner-portal/firebase.json` (new), `owner-portal/.firebaserc` (new), `owner-portal/.env.production`

- [ ] `cd owner-portal && firebase init hosting` — pick existing project, public dir `dist`, SPA = yes, no GitHub Action.

- [ ] In `.env.production`:
```
VITE_API_BASE=https://veris-web3-<hash>-uc.a.run.app
VITE_PUBLIC_API_BASE=https://veris-public-<hash>-uc.a.run.app
```

- [ ] Ensure all `fetch` calls in the portal use `import.meta.env.VITE_API_BASE` instead of localhost.

- [ ] Build + deploy:
```bash
npm run build
firebase deploy --only hosting
```

- [ ] Open the Firebase URL, sign in, confirm search and verdict views work end-to-end.

- [ ] Commit: `git commit -am "deploy: Firebase Hosting config + prod env"`

---

## Task 9 — Record a 90-second demo script

Not code, but required to win. Open a `DEMO.md`:

- [ ] Script the flow:
  1. "This is a Veris-captured photo. The crypto signature proves a registered device took it."
  2. "Now we ask Gemini to cross-check." Show the verdict badge + anomalies.
  3. "Try swapping the image — notice Gemini catches it even though CV signals are borderline."
  4. "And we can search the whole gallery by natural language." Type "sunset", show results.
  5. "Both backends on Cloud Run, portal on Firebase Hosting, powered by Gemini 2.5 Flash."

- [ ] Prep 3 preloaded test cases in the DB: (a) authentic, (b) swapped image, (c) AI-generated.

---

## Done criteria

- `/api/verify` returns a verdict with Gemini reasoning
- `/api/search` accepts text and image, returns top matches
- Owner portal live on Firebase, backends live on Cloud Run
- Demo walks end-to-end in under 2 minutes

## Cut if time runs out

Drop Task 5 (text search UI — keep it curl-able). Drop Task 9 polish. Everything else is core.

## Post-hackathon follow-ups (do not build now)

- `AuthenticityOracle` contract (on-chain verdict hash)
- Genkit eval harness with labeled dataset
- Vertex Vector Search (replace SQLite cosine loop)
- App Check on public-server
- Public reverse-verify endpoint
