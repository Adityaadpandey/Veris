# Identity, Wallet Linkage, Hardware Pairing & Conditional Capture

Date: 2026-09-08
Status: Approved for planning

## Summary

The app already has DigiLocker/Aadhaar identity verification and wallet
connection, sequenced correctly on first entry (landing → verify → connect →
portal). This spec closes three gaps:

1. **Enforce** — not just sequence — that a connected wallet always implies a
   verified identity, for the lifetime of the session, not just at connect time.
2. **Hardware pairing** — a new, skippable step for pairing a VERIS Hotshoe or
   VERIS Clip, introduced right after wallet connect, with a durable
   re-entry point from Profile.
3. **Conditional capture** — an in-app hardware-triggered photo capture
   feature that exists if and only if a Clip is paired, and is byte-for-byte
   invisible (not just inaccessible) when a Hotshoe is paired or nothing is.

## Non-goals

- Real DigiLocker/OAuth backend integration (already stubbed via mock
  functions in `use-digilocker.tsx` — out of scope, untouched).
- Real wallet SDK integration (already stubbed in `use-connection.tsx` —
  untouched).
- Real BLE/hardware pairing protocol or real Clip camera capture pipeline.
  Pairing and capture are mocked the same way DigiLocker/wallet already are:
  a fake async delay standing in for a real device handshake, with a comment
  marking where real hardware I/O plugs in.
- Redesigning the photo/claim data model. Captured photos are appended to
  the existing `PHOTOS`-shaped list using placeholder imagery, consistent
  with how the rest of the app is already fully mocked demo data.

## Architecture

### New hook: `use-device.tsx`

Mirrors the existing `use-digilocker.tsx` / `use-connection.tsx` shape and
storage pattern exactly (same `storage` shim, same
`undefined`-while-loading / persisted-flag convention).

```ts
export type DeviceKind = 'hotshoe' | 'clip';

type DeviceState = {
  /** undefined while the persisted values are still being read on launch. */
  paired: DeviceKind | null | undefined;
  /** Has the user ever been through the /pairing screen (paired or skipped)? */
  pairingSeen: boolean | undefined;
  pairing: DeviceKind | null;       // which device is mid-handshake
  pair: (kind: DeviceKind) => Promise<void>;
  skip: () => void;                 // marks pairingSeen without setting paired
  unpair: () => void;
};
```

Two independent persisted values are needed, not one — `paired` (which
device, if any) and `pairingSeen` (has the one-time onboarding screen ever
been shown/resolved). Collapsing these into one nullable field is a trap:
"never asked" and "asked, user skipped" would both have to serialize to
the same "no device" value, so a returning user who skipped would see the
pairing screen again on every wallet reconnect. Storage keys:
`veris.hotshoe.device` (`'hotshoe' | 'clip' | ''`) and
`veris.hotshoe.device.pairing-seen` (`'1' | unset`).

`pair()` sets `pairing`, waits a mock delay (~1300ms, matching
`use-connection.tsx`'s connect flow), persists both `paired` and
`pairingSeen = true`, clears `pairing`. `skip()` persists
`pairingSeen = true` only. No error path is modeled for pairing (it
"always succeeds" in the mock, same as wallet connect) — a comment marks
where a real failure/timeout path would plug in.

Registered in `_layout.tsx` alongside the other two providers, innermost
(it depends on nothing, nothing but the new screens depends on it).

### Enforcing identity↔wallet linkage

`src/app/(app)/_layout.tsx` currently redirects to `/landing` only when
`!connected`. Change the guard to `!connected || !verified` (import
`useDigilocker` alongside `useConnection`). This makes "inside the app" and
"wallet linked to a verified identity" the same fact, defensively, not just
at the moment of connecting.

`profile.tsx`'s "Disconnect DigiLocker" action currently only calls
`disconnectDigilocker()`. Change it to call **both** `disconnect()` (wallet)
and `disconnectDigilocker()` — severing identity severs the linked wallet,
consistent with "the wallet is understood as linked to a verified identity"
being a standing invariant, not a one-time gate. The row's note copy updates
from "YOU'LL RE-VERIFY NEXT TIME YOU CONNECT" to "ALSO DISCONNECTS YOUR
WALLET" so the cascade isn't a surprise.

Add a small identity indicator in `profile.tsx`'s identity block: a
mono-caps "VERIFIED" chip (same visual language as the DigiLocker screen's
`VERIFIED` label) next to the wallet address line, sourced from
`useDigilocker().profile?.name` — reinforces the two are one linked fact
without adding a new screen.

### Hardware pairing flow

**New screen `src/app/pairing.tsx`.** Visually a sibling of
`digilocker.tsx`/`wallet.tsx`: dark hero (espresso background, RadialGlow,
ViewfinderBrackets, BackButton) over a cream bottom sheet, reusing
`PillButton`. Content:

- Hero: `IDENTITY / GOVT-ISSUED`-style kicker → `HARDWARE / OPTIONAL`,
  headline in the display font, e.g. "Pair the module that signs your
  frames."
- Two device rows in the sheet, same row pattern as `WALLETS` in
  `wallet.tsx` (icon/dot, name, one-line note, trailing state label):
  - **VERIS Hotshoe** — "CLIPS TO YOUR CAMERA"
  - **VERIS Clip** — "CLIPS TO YOUR PHONE"
- Tapping a row calls `pair(kind)`; row shows "PAIRING…" while in flight,
  same disabled-siblings-while-pairing behavior as the wallet screen.
- On success: brief inline confirmation (row turns to a "PAIRED" state)
  then auto-advance to `/portal` after ~600ms, same beat as
  `digilocker.tsx`'s auto-redirect.
- Below the two rows: a plain-text skip action, `SKIP — I'LL PAIR LATER`,
  calling `skip()` then routing to `/portal`. Explicit, low-emphasis (mono,
  muted, no pill) — it must read as a legitimate path, not a dead end.

**Entry point:** `wallet.tsx`'s existing `useEffect(() => { if (connected)
router.replace('/portal') }, ...)` changes to route to `pairingSeen ?
'/portal' : '/pairing'`. This makes pairing a true one-time onboarding
beat: once a user has been through it (paired or explicitly skipped),
reconnecting a wallet in a future session goes straight to `/portal`. The
effect waits for `pairingSeen !== undefined` before deciding, same
loading-guard convention as the other hooks.

**Re-entry point:** `profile.tsx`'s existing hardcoded "PAIRED MODULE" card
becomes data-driven off `useDevice()`:
- `paired === 'hotshoe'` → existing card content (image, `#0043`,
  firmware/battery mock lines), unchanged visually.
- `paired === 'clip'` → same card shell, swapped copy/icon for a Clip
  (no camera-mount imagery; a phone-clip icon/description instead).
- `paired === null` (never paired or skipped) → a lower-emphasis CTA card,
  same slot: "No module paired" / "Pair a Hotshoe or Clip to sign frames
  in-app" → routes to `/pairing`.
- An "Unpair device" row is added to the settings list (mirrors the
  disconnect rows), calling `unpair()`, returning the card to the
  no-device state.

### Device state table

| `paired` value | Meaning | Dock capture button | Profile card |
|---|---|---|---|
| `undefined` | reading from storage | hidden | loading (existing pattern: render nothing until resolved) |
| `null` | never paired, or explicitly skipped | hidden | CTA card → `/pairing` |
| `'hotshoe'` | Hotshoe paired | **hidden** | Hotshoe module card |
| `'clip'` | Clip paired | **visible** | Clip module card |

The `null` and `'hotshoe'` rows are identical everywhere the spec requires
invisibility (the dock). They intentionally differ in the profile card,
per your call to scope invisibility to the capture affordance only.

### Conditional capture

**Dock (`components/dock.tsx`)** gains an optional 4th cell, rendered only
when `paired === 'clip'`: a raised circular shutter button sitting on the
dock's center, breaking the capsule's top edge (visually distinct from the
three flush tab cells — it's an action, not a tab). Implementation:
`Dock` takes a new optional prop `onCapture?: () => void`; when provided, a
`Pressable` renders absolutely-positioned above the bar, centered, using
the same `Palette.orange`/`Palette.bone` shutter-button language as
`PillButton`'s solid style. When `onCapture` is undefined, the dock's
existing three-cell `row` layout is emitted completely unchanged — no
reserved space, no conditional gap — so the Hotshoe/no-device cases are
pixel-identical.

`(app)/_layout.tsx` passes `onCapture={paired === 'clip' ? openCapture :
undefined}` where `openCapture` pushes `/capture`.

**New screen `src/app/capture.tsx`** (modal presentation, like `wallet.tsx`
already registers as `presentation: 'modal'` in root `_layout.tsx` — add
`capture` alongside it). Full-bleed dark screen:
- `ViewfinderBrackets` for the camera framing motif.
- Center: a live-camera-shaped placeholder area (a static dark frame — no
  real camera pipeline; out of scope) with mono caption `CLIP READY ·
  TAP TO CAPTURE`.
- Large circular shutter button, bottom center.
- Tap → local `capturing` state → ~900ms mock delay (comment: "hardware
  round-trip to the Clip for the signed hash lands here") → success state:
  a checkmark + `HARDWARE-SIGNED` mono tag, matching the orange accent
  used for `SPEC_TAGS` on the landing screen.
- "Done" PillButton returns to `/portal`. On success, a new entry is
  appended to the in-memory photo list (see below) with `status:
  'PENDING'`, today's mock date/place, and a placeholder image — same
  shape as one of the existing `PHOTOS` entries — so the capture visibly
  lands in the archive's "PENDING SYNC" flow that already exists.
- BackButton to dismiss without capturing.

**Photo list mutation:** `constants/photos.ts`'s `PHOTOS` export is
currently a static const, read directly by `portal.tsx`. To let a capture
append an entry without restructuring the whole data layer, add a minimal
`useCaptures()`-style store: a small module-level array + subscriber
pattern (or, more simply, promote `PHOTOS` display into the existing
`useState` already in `portal.tsx` seeded from `PHOTOS`, and have
`capture.tsx` prepend via a shared tiny Zustand-less pub/sub in
`constants/photos.ts`, e.g. `export function addCapturedPhoto(photo:
Photo)` backed by a module-level array plus a `useSyncExternalStore`
hook). This stays in-memory only (not persisted) — restarting the app
resets to the seed seven, which is consistent with the rest of the app's
data being fully mocked and non-persistent.

## Full flow (first-time user)

```
onboarding → landing
  → digilocker (verify Aadhaar)
    → wallet (connect)
      → pairing (pair Hotshoe / Clip / skip)   ← new, one-time
        → portal
```

Returning user (already verified + connected + already been through
pairing once, paired or skipped): `index.tsx`'s existing
`connected`-based redirect sends them straight to `/portal`, unchanged.

Re-entry to pairing at any later time: Profile → module card / "Pair a
device" CTA → `/pairing` (same screen, no "skip" beat needed since they're
already past onboarding — screen works identically, skip is still offered
for consistency but isn't the expected path).

## Error handling

- Pairing has no failure mode in the mock (matches wallet connect); a code
  comment marks where a real "handshake timed out" / "device not found"
  path would surface, using the same `error` + inline message pattern
  `use-digilocker.tsx` already has.
- Disconnecting DigiLocker while a device is paired does **not** unpair the
  device — hardware pairing is a property of the phone/module relationship,
  not the identity, so it survives a re-verification. Only wallet
  connection cascades from identity.
- If capture's mock "hardware round-trip" were to fail in a future real
  implementation, the screen would show an inline error and let the user
  retry — out of scope to build now since the mock never fails, but the
  screen's state shape (`idle | capturing | success`) leaves room for an
  `error` variant later without restructuring.

## Testing

No test infrastructure exists in the repo today (no test runner in
`package.json`). Verification is manual, matching how the existing
DigiLocker/wallet flows were evidently verified:

- Fresh install (clear storage): onboarding → landing → digilocker →
  wallet → pairing appears once → skip → portal; dock has 3 tabs, no
  capture button; profile shows "no module paired" CTA.
- Same fresh flow, but pair a Clip: dock shows the 4th shutter button;
  capture screen opens, mock-captures, new PENDING card appears in
  archive.
- Same fresh flow, but pair a Hotshoe: dock has 3 tabs (identical to the
  skip case); profile shows the Hotshoe module card.
- From profile, disconnect DigiLocker: wallet also disconnects, app
  returns to `/landing`; paired device state is untouched (verify by
  reconnecting — profile still shows the same paired module).
- From profile, unpair a Clip: dock's shutter button disappears
  immediately; profile card reverts to the CTA state.
- Kill and relaunch the app after pairing (or skipping): `/pairing` is
  **not** shown again; user lands straight in `/portal` (or `/landing` if
  wallet/identity aren't both connected).
