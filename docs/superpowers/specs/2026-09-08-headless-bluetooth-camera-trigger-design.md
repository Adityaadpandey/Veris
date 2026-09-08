# Headless Bluetooth Shutter Trigger + Phone Tethering

**Date:** 2026-09-08
**Scope:** `hardware-camera-app/` (new headless entrypoint alongside the existing Kivy app), plus requirements for a separate React Native companion app (not in this repo)
**Approach:** Extract shared capture/sign/upload logic out of the Kivy app into a Kivy-free module; add a new headless entrypoint that drives it over classic Bluetooth (RFCOMM/SPP), using the same paired Android phone for both the shutter trigger and internet tethering (Bluetooth PAN).

---

## Background

The Pi currently runs `raspberry_pi_camera_app.py`, a ~2500-line Kivy touchscreen GUI. The on-screen shutter button (`take_photo`) captures a photo, signs it with the device's hardware identity, uploads it to `hardware-web3-service` (`BACKEND_URL`), and shows a claim QR code — all rendered on an attached screen.

Some deployments will have no screen at all. For those units, the shutter needs to be triggered from a paired Android phone over Bluetooth, and since the Pi may have no other internet access in the field, the same phone should also share its mobile data with the Pi over Bluetooth when a photo needs to be uploaded.

## Goals

- Trigger a photo capture from an Android phone over Bluetooth, with no touchscreen involved.
- Use the phone's mobile data (via Bluetooth PAN tethering) for the upload/sign/claim network calls, only when needed.
- Report capture/sign/upload progress back to the phone live, since there's no screen to show it on.
- Don't break or duplicate logic for existing touchscreen deployments.

## Non-goals

- No BLE — classic Bluetooth RFCOMM/SPP is used for both the trigger channel and PAN tethering, keeping one consistent Bluetooth stack.
- No phone-side viewfinder/live preview in this iteration (the existing `stream_server.py` MJPEG stream already exists separately and isn't part of this change).
- No gallery browsing, mode switches, or other GUI features from the phone — trigger + status only.
- No custom pairing UI — pairing the phone and enabling Bluetooth tethering are one-time manual OS-level steps on the phone and Pi.

---

## Architecture

```
Phone (React Native, Android)
  ├─ pairs once with Pi over Bluetooth (OS-level, one-time)
  ├─ RFCOMM/SPP socket → connects to Pi's known SPP UUID
  ├─ tap shutter → writes "CAPTURE\n"
  └─ reads newline-delimited status lines back, live

Pi: headless_camera_app.py (new, no Kivy)
  ├─ bt_trigger_server.py — RFCOMM SPP server, accepts the phone's
  │    connection, parses commands, writes status back
  ├─ bt_tether.py — before uploading, brings up bnep0 via
  │    `bt-pan client <phone-MAC>`, waits for a DHCP lease (with timeout)
  └─ capture_pipeline.py (shared) — capture → sign → upload → claim,
       plus the on-disk retry queue for offline uploads
```

`raspberry_pi_camera_app.py` (the existing Kivy app) is refactored to call into `capture_pipeline.py` instead of duplicating the capture/sign/upload logic inline, but its GUI and behavior are otherwise unchanged — it remains the entrypoint for any unit that still has a touchscreen.

## Components

### `capture_pipeline.py` (new, shared, no Kivy import)

Extracted from the current Kivy app with no behavior change other than swapping `Clock.schedule_once(lambda dt: self.show_status(...))` calls for a plain `status_callback(message, level)` argument passed in by the caller:

- `CameraController` — moved as-is (`take_photo()` already has no Kivy dependency).
- `sign_image(hardware_identity, image_path)` — moved from `_sign_image`.
- `get_location()` — moved from `_get_location`.
- `upload_and_create_claim(filename, signature_info, camera_id, status_callback)` — moved from `_upload_and_create_claim`, calling `status_callback` instead of scheduling Kivy UI updates. On failure to reach `BACKEND_URL`, enqueues the photo into the retry queue instead of just reporting failure.
- `retry_pending_uploads(status_callback)` — scans the on-disk queue and retries each entry; removes an entry on success.

The Kivy app's `take_photo`/`_upload_and_create_claim`/`_sign_image` become thin wrappers that call these shared functions with a `status_callback` that does the existing `Clock.schedule_once` UI work.

### `bt_trigger_server.py` (new)

A classic Bluetooth RFCOMM/SPP server (`PyBluez` or the stdlib `bluetooth` socket module):

- Advertises the standard SPP UUID (`00001101-0000-1000-8000-00805F9B34FB`) under a fixed, recognizable Bluetooth device name (e.g. `Veris-Cam-<device-id>`), so the phone can find it without hardcoding a MAC address.
- Runs an accept loop: serves one phone connection at a time; on disconnect, goes back to listening — no Pi restart needed if the phone walks out of range or the app is killed.
- Reads newline-delimited commands. For v1, the only command is `CAPTURE`.
- Exposes a `send_status(line)` method used by the capture pipeline's `status_callback` to write progress back down the same socket.

### `bt_tether.py` (new)

Thin wrapper around Bluetooth PAN (BNEP) networking:

- `ensure_link(phone_mac, timeout=10)` — checks whether `bnep0` already has an IP; if not, runs `bt-pan client <phone_mac>` and polls for a DHCP lease up to `timeout` seconds.
- Returns `True`/`False`. Callers (the upload step) treat `False` as "still offline" and fall back to the retry queue.
- Requires the phone to already be paired/trusted (one-time manual step via `bluetoothctl`) and to have Bluetooth tethering turned on when a photo needs to go out.

### `headless_camera_app.py` (new entrypoint)

Wires the above together:

1. On startup: start `bt_trigger_server.py`'s accept loop in a background thread; kick off `retry_pending_uploads()` once (in case there's a backlog from a previous offline period) and again on a periodic timer (e.g. every few minutes) in case the phone reconnects with tethering on without a new trigger happening.
2. On receiving `CAPTURE`: run the same capture → sign → upload flow as the Kivy app, via `capture_pipeline.py`, streaming status back through `bt_trigger_server.send_status()`.
3. Status vocabulary sent to the phone: `CAPTURING`, `CAPTURED`, `SIGNED`, `TETHERING`, `UPLOADING`, `UPLOADED:<claimUrl>`, `QUEUED:offline`, `FAILED:<stage>`.
4. Ships as a systemd service analogous to the existing `lensmint.service`, running under the same user/venv as the current app.

### Retry queue

- A `pending/` directory next to `CAPTURE_DIR`, one JSON file per queued upload (image path + signature info + camera id).
- Written whenever `upload_and_create_claim` can't reach `BACKEND_URL` (matches the existing Kivy app's "Offline - Saved Locally" behavior, just without a screen to show it on).
- Drained by `retry_pending_uploads()`, called after a successful `bt_tether.ensure_link()` and on the periodic timer. Each successful retry removes its queue file; if the phone happens to be connected at that moment, its status is also pushed over the RFCOMM socket, but a phone being disconnected at retry time is not an error — this is best-effort notification only.

---

## Data flow

1. One-time setup: pair the phone with the Pi (`bluetoothctl` on the Pi; standard pairing flow on the phone), and turn on the phone's Bluetooth tethering toggle.
2. RN app connects an RFCOMM socket to the Pi (fixed SPP UUID, Pi discoverable by its fixed device name).
3. User taps the shutter button in the RN app → sends `CAPTURE\n`.
4. Pi captures the photo, signs it, brings up the Bluetooth PAN link if not already up, uploads, and streams back status lines.
5. RN app shows live progress and, on `UPLOADED:<claimUrl>`, the claim URL/QR for the minting step.
6. If step 4's tether attempt times out, the photo is queued and the phone sees `QUEUED:offline`; the Pi retries automatically once a link is available, without needing another `CAPTURE` command.

## React Native app requirements

- `react-native-bluetooth-classic` (Android RFCOMM support).
- Connect to the paired device by its fixed name, SPP UUID `00001101-0000-1000-8000-00805F9B34FB`.
- Send `CAPTURE\n` on the shutter button tap.
- Read newline-delimited status strings and reflect them in the UI per the vocabulary above.
- Track socket connection state independently (Pi may not be paired/reachable) and show a "not connected" state; handle reconnecting after a drop since the Pi's server always goes back to accepting.

## Error handling

- No phone connected: the RFCOMM server just waits; the phone's own socket state drives its "not connected" UI — nothing to do on the Pi side.
- Capture failure (camera error): `FAILED:capture`.
- Signing failure: `FAILED:signing`.
- No internet within the tether timeout: photo + signature are queued to disk, phone sees `QUEUED:offline`, Pi retries automatically later.
- Upload failure after a successful tether (backend error, non-200, etc.): same queue-and-retry path as the offline case.

## Testing

- Manual, since this is hardware-in-the-loop: pair a Pi + Android phone, enable phone Bluetooth tethering, use a generic Android "Bluetooth terminal" app to send `CAPTURE` and verify the status sequence and an actual upload/claim, before the RN app exists.
- Once the RN app is available, repeat end-to-end through it, including: normal trigger, trigger with phone tethering off (verify queue + later auto-retry), and reconnect-after-drop.
- No screen on the target device — all verification is either via the phone or by SSHing into the Pi and tailing the service logs.

## Open items / follow-ups (explicitly out of scope for this iteration)

- Live preview from the phone (would reuse `stream_server.py` over the PAN link, or a future BLE/WiFi path) — not part of this change.
- Multiple paired phones / access control on the RFCOMM server — v1 assumes a single trusted phone.
- iOS support — classic Bluetooth RFCOMM isn't available to third-party iOS apps; would need a BLE GATT redesign if iOS is ever required.
