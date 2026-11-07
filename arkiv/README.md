# Arkiv in Veris

Design notes for the Arkiv part of Veris. Back to the [main README](../README.md).

## Track

- Sponsor: Arkiv, ETHGlobal Mumbai, Continuity track (existing projects).
- Flag: `ARKIV_ENABLED` in `public-server`; reads fall back to Postgres.
- Verify: `GET https://api.veris.live/api/arkiv/search?imageHash=<hash>` answers with `"source":"arkiv"`.
- The other sponsors are listed in the [root README](../README.md#tracks-and-sponsors).

## What Arkiv is here

- Arkiv is a public, queryable on-chain data layer.
- Veris mirrors each photo's provenance record to it.
- Anyone can ask "was this photo captured by a Veris camera" without trusting our server.
- Postgres stays the permanent record. Arkiv is the public, self-expiring copy.
- Code: `public-server/arkivService.js` (backend) and `owner-portal/src/lib/arkivDirect.js` (browser).
- Only the backend writer wallet writes. Users only read.

## Schema at a glance

| Entity          | One per                    | Indexed fields                                        | Lives for                                                                |
| --------------- | -------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `veris-claim`   | captured photo             | `claimId`, `imageHash`, `deviceId`, `owner`, `status` | `pending`: 24 hours. `minted`: longest Arkiv allows (capped at 180 days) |
| `veris-license` | USDC license bought on Arc | `tokenId`, `licensee`                                 | Exactly until the license ends                                           |

- Both also hold a `record` bytes field with the full JSON. It is not queried.
- Full field tables: [schema.md](schema.md).

## Read path

- The portal Search page asks Arkiv first, then falls back to Postgres.
- The server route is `GET /api/arkiv/search` (by `imageHash` or `deviceId`).
- A failed Arkiv write is retried later, so a capture never fails because Arkiv is down.

## Files in this folder

| File                                         | What it answers                                                                |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| [schema.md](schema.md)                       | Which entities and fields we write, and how long they live.                    |
| [how-you-use-arkiv.md](how-you-use-arkiv.md) | Which queries the product runs and what each Arkiv feature changes for a user. |
| [why-arkiv.md](why-arkiv.md)                 | What users would lose on Postgres alone, and what we kept off Arkiv.           |
| [reach.md](reach.md)                         | Who uses it, live entity counts, and the live verify endpoint.                 |
| [friction.md](friction.md)                   | Problems we hit with the SDK and network.                                      |
