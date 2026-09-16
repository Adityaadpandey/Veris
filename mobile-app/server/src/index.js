import 'dotenv/config';
import cors from 'cors';
import express from 'express';

import { completeSession, createSession, resolveRedirect } from './digilocker.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

// Contract consumed by src/hooks/use-digilocker.tsx on the app side.
// `returnTo` is only sent by the web build — see createSession()'s doc comment.
app.post('/api/digilocker/session', async (req, res) => {
  try {
    const { authUrl, state } = await createSession({ returnTo: req.body?.returnTo });
    res.json({ authUrl, state });
  } catch (err) {
    console.error('[digilocker] session create failed:', err);
    res.status(502).json({ error: err instanceof Error ? err.message : 'Failed to start DigiLocker session.' });
  }
});

// DigiLocker/Setu's own redirect target — see resolveRedirect() for why this hop exists.
app.get('/api/digilocker/redirect', (req, res) => {
  res.redirect(302, resolveRedirect(req.query));
});

app.post('/api/digilocker/callback', async (req, res) => {
  const state = req.body?.state ?? req.body?.id;
  if (!state) return res.status(400).json({ verified: false, reason: 'Missing session state.' });

  try {
    const result = await completeSession(state);
    res.json(result);
  } catch (err) {
    console.error('[digilocker] callback failed:', err);
    res.status(502).json({ verified: false, reason: 'DigiLocker verification failed. Please try again.' });
  }
});

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`veris-hotshoe-server listening on :${port}`);
});
