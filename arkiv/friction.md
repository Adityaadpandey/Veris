# Friction

Things that got in our way, from the commits that fixed them:

1. **`addr` columns reject plain strings.** Expected a `0x...` string to work for an `addr()`
   field; the write was refused until we wrapped the value in `addr(value)`.
   Repro: define `owner: addr().indexed()` and pass a raw hex string to `createEntity`.
2. **`bytes` comes back as `0x` hex, not `Uint8Array`.** Expected to decode with
   `TextDecoder`; it returned a hex string, so our `JSON.parse` failed on reads.
3. **Errors were easy to swallow.** A failed search silently fell back to Postgres, which hid
   that Arkiv was failing. We now log the first line of the error.
4. **Maximum life is ~182 days, learned by trial.** Writing a longer expiry is refused. A
   documented constant in the SDK would have saved us a guess.
5. **`http` is not exported by the SDK.** It comes from `viem`; an example in the docs that
   shows the full import list for a read-only client would help.
6. **An invalid or expired access key gives `401 INVALID_KEY` with the key inside the URL**,
   so a pasted error log leaks the key. Keep the key out of the URL path or mask it in errors.
