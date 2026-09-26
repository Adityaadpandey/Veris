# How Veris uses Arkiv

| Thing we filter on | Why it fits |
|---|---|
| `imageHash` | The verify page: someone holds a photo and asks "was this captured by a Veris camera". |
| `deviceId` | "All photos from this camera", the same page. |
| `claimId` | The claim page loads its provenance record. |
| `status`, `owner` | Separate abandoned captures from minted ones, and list a wallet's photos. |
| `tokenId`, `licensee` | Show who licensed a photo and whether it is still licensed. |

**Who can edit:** only the backend writer wallet. Users never write; they read.

**What each Arkiv feature changes for a user**
- **Expiry on pending claims (24 h):** a camera that was never claimed does not leave
  clutter in search results.
- **Expiry on licenses:** a license entity disappears the moment its term ends, so the
  page needs no cleanup job and cannot show a stale license.
- **Indexed attribute queries:** the verify page (`owner-portal` SearchPage, via
  `GET /api/arkiv/search`) runs on them.
- **Public read:** anyone can check a photo's provenance without asking us for access.

**Fallback:** every read tries Arkiv first and falls back to Postgres, and a failed write
is retried by a sweep, so a capture never fails because Arkiv is down.
