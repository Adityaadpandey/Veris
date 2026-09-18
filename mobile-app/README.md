# Veris Hotshoe

A demo/prototype Expo app for **Veris Hotshoe** — a hardware module ("Hotshoe" for
DSLR/mirrorless cameras, "Clip" for phones) that signs a photo with a hardware key
the instant it's captured, then seals that proof on-chain. The app is the owner's
portal to that archive, a public registry to verify any sealed frame, and the
capture surface for the phone-based Clip.

Everything blockchain/hardware here is **simulated** for the demo — see
[What's real vs. mocked](#whats-real-vs-mocked) before treating any of it as a spec
for production behavior.

## Tech stack

- **Expo SDK 57** + **Expo Router** (file-based routing, typed routes, React
  Compiler enabled) — see `AGENTS.md`, Expo 57 docs differ from older versions.
- **React 19** / **React Native 0.86**
- **react-native-reanimated 4** for all motion (shared values, springs, layout
  transitions) — no `Animated` API from core RN.
- **react-native-gesture-handler** for the capture screen's pinch-to-zoom.
- **react-native-svg** for icons, gradients, and the radial-glow background effect.
- **expo-camera**, **expo-image-picker**, **expo-media-library** — real device
  camera, gallery picking, and saving to the photo library.
- **expo-secure-store**, with a `localStorage` fallback on web (secure-store has
  no web implementation) — used for every piece of persisted app state.
- A separate **Node/Express backend** (`server/`) fronting Setu's DigiLocker
  eKYC API — kept out of the Expo app itself so `app.json`'s `web.output: "static"`
  never has to change (see `server/README.md`).
- No real blockchain, wallet SDK, or AI search — all mocked (see below).

## App flow

```
index ("/")
  └─ redirect: connected? → /portal : /onboarding

/onboarding            (carousel, autoplay + tap-through, SKIP)
  └─ ENTER / SKIP → /landing

/landing               (public marketing splash)
  ├─ "01 Owner portal"  → connected? /portal
  │                       verified?  /wallet
  │                       else       /digilocker
  └─ "02 Verify a photo" → /verify   (public search, no wallet/identity needed)

/digilocker            (govt identity check, via DigiLocker/Setu)
  └─ verified → /wallet

/wallet                (modal-presented wallet connect picker)
  └─ connected → /portal   (auto-redirect on connect)

/portal, /search, /capture      ← the "(app)" group, wrapped by <Dock/>
  ├─ /portal   "The archive"     — grid of the owner's sealed/licensed/pending photos
  ├─ /search   "Ask the registry" — same UI as /verify, but wallet-scoped
  ├─ /capture  "Click Photo"     — only reachable/shown when a Clip is paired
  └─ /profile                    — reached from portal's header chip, not a dock tab

/claim/[index]         (full claim sheet for one photo — reachable from portal
                        grid, search results, capture's "sealed" tags, or a
                        shared public link)

/verify                (same SearchScreen as /search, but the public/no-wallet
                        entry point from the landing screen)
```

Key routing rules baked into the code:

- `src/app/index.tsx` gates on `useConnection().connected` (wallet connected or
  not) — `undefined` while the persisted flag is still loading, which keeps the
  native splash screen up instead of flashing the wrong screen.
- `src/app/landing.tsx`'s "Owner portal" row chains three states: already
  connected → straight to `/portal`; identity verified but no wallet → `/wallet`;
  neither → `/digilocker` first. **Identity check always happens before wallet
  connect.**
- `src/app/(app)/_layout.tsx` decides `showDock` (hidden only on `/profile`,
  which is a detail screen, not a tab) and derives the active tab from the
  pathname. It also owns the first-run device-pairing prompt: shown once,
  exactly when `connected && verified && device === 'none' && !dismissed`.
- `src/app/(app)/capture.tsx` redirects back to `/portal` if a device other than
  `'clip'` is paired (a Hotshoe signs at its own physical shutter, not from the
  app, so its owner never needs this screen).

## Global state (root providers)

`src/app/_layout.tsx` wraps the whole router `<Stack>` in four context
providers, in this order — `DigilockerProvider → ConnectionProvider →
DevicePairingProvider → PhotosProvider`:

| Hook | File | Backs | Persistence key |
|---|---|---|---|
| `useConnection()` | `use-connection.tsx` | wallet address + connect/disconnect | `veris.hotshoe.connected` |
| `useDevicePairing()` | `use-device-pairing.tsx` | which hardware (`'none' \| 'hotshoe' \| 'clip'`) is paired, and whether the first-run prompt was dismissed | `veris.hotshoe.device`, `veris.hotshoe.device_prompt_dismissed` |
| `useDigilocker()` | `use-digilocker.tsx` | identity verification state + profile | `veris.hotshoe.digilocker` |
| `usePhotos()` | `use-photos.tsx` | the in-memory photo archive (seed data + anything captured this session) | none — resets on reload |

All three persisted hooks share the same pattern: a `boolean | undefined` state
that starts `undefined` while the stored flag loads (screens use this to avoid a
flash of the wrong UI), then `SecureStore` on native / `window.localStorage` on
web.

## Design system ("brutal glass")

Documented at the top of `src/constants/theme.ts`: a fixed-palette,
**not** light/dark-themed product. Two visual languages, deliberately kept
distinct rather than blended:

- **Neobrutalist blocks** (`BrutalBlock`) — solid fill, thick ink border, and a
  flat, *unblurred* offset "sticker" shadow (no shadow blur anywhere). Used for
  all content and controls: cards, buttons, chips, sheets.
- **Frosted glass** (`GlassPanel`, built on `expo-blur`'s `BlurView`) — reserved
  for floating chrome only: the dock, header chips, modals' backdrop cards,
  badges over photos. Never used for regular content.

Palette (`Palette` in `theme.ts`): `cream`/`paper` (light surfaces), `ink`
(near-black, the universal border/text-on-light color), `orange`/`orangeHover`
(the one brand accent — used for CTAs, active states, and signing/seal
indicators), `espresso`/`charcoal`/`onyx` (near-black screen backgrounds),
`bone` (off-white text on dark), `green` (the one place the palette means
"verified/authentic" instead of "brand").

Other tokens: `Border` (hairline → heavy, always solid), `Radius` (small,
deliberate corners — never soft/pill-everywhere), `Shadow.hard()` (the flat
offset-shadow helper), `Glass.*` (translucency tints for `GlassPanel`), `Tones`
(8 three-color gradient sets, cycled per-photo for `PhotoThumb`'s diagonal tone
wash), typography helpers in `constants/typography.ts`:
- `display()` — Archivo Black, uppercase, tight tracking — all headlines.
- `body()` — Archivo (regular/medium/semibold/bold) — running text.
- `mono()` — IBM Plex Mono, letter-spaced, mostly uppercase — the recurring
  micro-copy/label/kicker style (`"SIGNED AT CAPTURE"`, `"01 / THE PROBLEM"`, etc).

A recurring camera-viewfinder corner-bracket motif (`ViewfinderBrackets`) marks
every full-bleed dark screen (landing, onboarding, wallet, digilocker).
`RadialGlow` (stacked-circle approximation of a radial gradient — real SVG
`RadialGradient` renders solid on Android) puts a soft orange glow behind each
of those heroes; `LinearScrim` is the equivalent top-to-bottom linear-gradient
workaround, same Android caveat.

### Shared components (`src/components/`)

| Component | Purpose |
|---|---|
| `BrutalBlock` | The core neobrutalist surface (see above) |
| `GlassPanel` | The core frosted-chrome surface (see above) |
| `PillButton` | Chunky offset-shadow CTA (onboarding, search, claim) — caller supplies colors |
| `BackButton` | Frosted circular back control, `dark`/`light` variants |
| `PhotoThumb` | Photo tile with the diagonal tone-wash overlay; `dynamic` sizes by the photo's real aspect ratio |
| `RadialGlow` / `LinearScrim` | Gradient-effect backgrounds (Android-safe implementations) |
| `ViewfinderBrackets` | Four corner brackets, the "camera" motif |
| `Dock` | The bottom nav bar (see next section) |
| `PairingModal` | First-run "pair a device" modal |

`useBrutalPress(offset)` (`src/hooks/use-brutal-press.ts`) is the shared press
physics used everywhere a `BrutalBlock`/`GlassPanel` needs to look like it's
being pushed flush into its own shadow — pass the same `offset` the block uses.

## The Dock (bottom nav) — recently redesigned

`src/components/dock.tsx`, rendered by `(app)/_layout.tsx` on every app-group
screen except `/profile`.

- **No device paired, or a Hotshoe paired:** a plain 2-cell glass bar —
  **Certificates** (portal) and **Verify** (search) — with a sliding orange
  "chip" indicator behind whichever tab is active.
- **A Clip is paired:** the bar still only holds those same two cells (the chip
  now slides only between them), and **Click Photo** becomes a standalone
  circular shutter button, centered, popped up so it half-overlaps the top edge
  of the bar (Snapchat-style camera FAB) — not a third equal-width tab. It
  springs in with a slight overshoot when it first appears, presses flush like
  a real shutter, and inverts from orange-fill/ink-icon to ink-fill/orange-icon
  while `/capture` is the active screen. The chip deliberately does **not**
  jump to "portal" while capture is active — it just stays wherever it was.

## Capture screen (`(app)/capture.tsx`)

Only reachable (and only linked from the dock) when `device === 'clip'`; redirects
to `/portal` otherwise. Uses the **real device camera** (`expo-camera`), not a
mock viewfinder:

- Live `CameraView` full-bleed, with pinch-to-zoom (`react-native-gesture-handler`
  `Gesture.Pinch`), a flash-mode cycle button (`off → auto → on`), and front/back
  flip.
- Shutter → `takePictureAsync` → `sealFrame()`, which fakes the Clip's hardware
  signing pass with a `setTimeout`, tagging the shot `"UPLOADING…"` then
  `"✓ SEALED"` in a small stack of pills (tap a sealed tag to jump to its claim
  sheet). Multiple shots can be "sealing" concurrently.
- A gallery button (`expo-image-picker`) lets you seal an existing photo instead
  of shooting one — same `sealFrame()` path.
- Requests camera permission on first use, with a dedicated permission-denied
  screen (deep-links to OS settings if permission can't be re-asked).

`usePhotos().addCapturedPhoto()` builds a full `Photo` record around the real
captured URI: today's date, a Bengaluru placeholder GPS/place, a fabricated
token/tx/hash, `status: 'SEALED'`, `lic: 'EDITORIAL'`, and `phoneMatch: true` —
then prepends it to the in-memory archive (lost on reload; not persisted).

## Search / Verify (`src/screens/search-screen.tsx`)

One shared component mounted at two routes:

- `/search` (`(app)` group) — "leave" returns to `/portal`.
- `/verify` (top-level) — the **public** entry point from landing's "02" row;
  "leave" goes back if not connected, or to `/portal` if it turns out you are.

Behavior:
- Free-text query is tokenized, stop-words stripped, and scored against each
  photo's caption/tags/place/date/code/licence/status/lens (`terms.length ?
  hits/terms.length : 0`) — a simple substring/keyword match, **not** real AI
  semantic search despite the "AI SEARCH" / "SEMANTIC + SEAL MATCH" copy.
- Suggested-query chips run the same search.
- "No match" state explicitly frames a miss as a feature: "if a photo claims to
  be sealed and does not appear here, it was never signed by a Hotshoe."
- A "reverse check" card ("drop an image, we'll tell you if it was ever sealed")
  is a pure `setTimeout` mock — always resolves to the same canned "match found,
  edited copy" result; it doesn't actually accept a file or hash anything.

## Claim sheet (`/claim/[index]`)

The full detail page for one sealed photo — reachable from the portal grid,
search results, capture's sealed tags, or a shared public link
(`publicClaimUrl()` in `constants/config.ts`, which resolves to the current web
origin, the dev-server LAN address, or a `https://veris-hotshoe.app` placeholder
for native shares).

- **Download** → `saveToPhotoLibrary()` (`src/lib/save-photo.ts`) — real
  `expo-media-library` save on native; explicitly unsupported on web.
- **Share** → native `Share.share()` with a text summary (code, seal date,
  owner address, token/licence, seal tx, public link); iOS attaches the image
  file, Android/web fall back to text-only or clipboard.
- **Licence it** → `Alert`-only mock ("request sent").
- **Capture metadata** — camera/lens/shutter/aperture/ISO/GPS/capture time,
  displayed as if read from EXIF (it's fabricated per-photo in `photos.ts`, or
  synthesized for a real capture in `use-photos.tsx`).
- **On-chain claim** — token id, contract, mint tx, edition, royalty, licence,
  a "perceptual hash" — all hardcoded strings, no real chain.
- **Device ↔ phone match** — a "did the phone's own camera-roll copy pixel-match
  the hardware-signed capture" card, gated on `photo.phoneMatch`; when true it
  shows two thumbnails side-by-side captioned "SIGNED" / "ROLL COPY" — **both
  are the same image**, since there's no real second source to compare against.
- **Similar frames** — just the other photos in the archive, first 6.

## Portal, Profile

- **`/portal`** — "The archive": owner header (address chip → `/profile`,
  device-pairing label), status filter chips (`ALL/SEALED/LICENSED/PENDING`),
  newest/oldest sort, a 2-column photo grid, and a static "18 frames pending
  Wi-Fi sync" card (not wired to any real count).
- **`/profile`** — identity header, a 3-stat strip (sealed/licensed/disputes —
  all hardcoded), a paired-device card whose content branches on
  `hotshoe`/`clip`/`none`, and an accordion of settings rows: signing-key
  rotation (fake, `Alert` + timer), licensing-terms preset (real local state,
  no backend), device pairing (opens `PairingModal`), Hotshoe-only firmware
  update (fake), dispute centre (fake), and destructive
  disconnect-wallet/disconnect-DigiLocker rows (real — these do clear the
  actual persisted state and route you back to `/landing`).

## DigiLocker identity check (`/digilocker`)

Real integration contract, with a zero-setup mock fallback — see
`server/README.md` for the full backend story. Summary:

- The Expo app never talks to DigiLocker/Setu directly. It calls its own tiny
  Node/Express backend (`server/`), which holds the Setu credentials and never
  forwards raw eKYC data (Aadhaar number, photo, DOB) to the client — only a
  display name + doc-type label.
- **With `EXPO_PUBLIC_API_BASE_URL` unset** (the default, out of the box): a
  1.4s `setTimeout` stands in for the whole flow and always "verifies" as
  `A. Sharma / AADHAAR E-KYC`.
- **With it set:** native opens `session.authUrl` in an in-app browser
  (`expo-web-browser`'s `openAuthSessionAsync`) and resumes via the app's
  `verishotshoeapp://` URL scheme; web hands the whole tab over to the
  `authUrl` and picks the result back up from query params after the server's
  redirect bounces it back (`consumePendingWebRedirect()`), since a browser tab
  reload can't resolve an in-memory promise.
- Server backend: `server/src/index.js` (Express routes) +
  `server/src/digilocker.js` (the 3-function Setu contract:
  `createSession`/`buildAppRedirectUrl`/`completeSession`). Kept as a separate
  service specifically so the Expo app's `web.output: "static"` config never
  has to change to `"server"`.

## What's real vs. mocked

Real:
- Camera capture, gallery picking, saving to photo library, and native share
  (device APIs actually used).
- All persisted app state (wallet-connected flag, device pairing, DigiLocker
  verified flag) via SecureStore/localStorage.
- The DigiLocker integration *contract* (backend exists, has a real Setu
  sandbox integration) — currently running against the mock fallback unless
  `EXPO_PUBLIC_API_BASE_URL` is configured.

Simulated / hardcoded, by design, for demo purposes:
- Wallet connect (any of the 4 listed providers "connects" after an 1100ms
  timer; no real wallet SDK).
- Hardware signing at capture (`sealFrame`'s timeout stands in for the Clip
  actually signing anything).
- The on-chain claim record (token/contract/tx/royalty/hash — all fabricated
  strings, no chain).
- "AI" search (keyword/substring scoring, not semantic).
- The reverse-image "was this ever sealed" check (always the same canned
  result).
- Device ↔ phone pixel-match comparison (shows the same image twice).
- Profile's firmware update, key rotation, and dispute-filing flows (`Alert` +
  timers only).
- Portal's "18 frames pending sync" count and profile's stat strip
  (412 sealed / 31 licensed / 6 disputes) — static numbers.

## Project structure

```
src/
  app/                    expo-router file-based routes
    (app)/                the tab-bar group: portal, search, capture, profile
    claim/[index].tsx      claim sheet, dynamic route
    _layout.tsx           root: fonts, providers, Stack
    landing.tsx, onboarding.tsx, wallet.tsx, digilocker.tsx, verify.tsx, index.tsx
  components/             shared UI (see table above)
  constants/              theme.ts, typography.ts, photos.ts (seed data), config.ts, onboarding.ts
  hooks/                  use-connection, use-device-pairing, use-digilocker,
                          use-photos, use-brutal-press
  screens/search-screen.tsx   shared between /search and /verify routes
  lib/save-photo.ts       photo-library save helper
server/                   separate Node/Express backend for DigiLocker (see server/README.md)
```

## Running it

```bash
npm install
npx expo start          # then press i / a / w, or scan with Expo Go
```

Optional, for a non-mocked DigiLocker flow:

```bash
cd server && npm install && cp .env.example .env   # fill in Setu credentials
npm run dev
```

then set `EXPO_PUBLIC_API_BASE_URL=http://localhost:8787` for the Expo app (see
`server/README.md` for the full setup and the redirect-URL allowlisting step).

> **Note:** `AGENTS.md` flags that Expo has changed significantly — this
> project targets **Expo SDK 57**; check
> [the versioned v57 docs](https://docs.expo.dev/versions/v57.0.0/) rather than
> general/latest Expo docs when making changes.
