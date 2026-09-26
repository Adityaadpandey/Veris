# Why Arkiv

**If this data stayed in Postgres, users would lose:**
1. Independent checking. A photo's provenance would be readable only through our server.
   On Arkiv anyone can run the same query, which is the point of a "proof it is real" product.
2. Self-expiring state. Pending claims and licenses end on their own schedule on-chain
   rather than by a cron job we could get wrong or stop running.
3. A copy that outlives our hosting. Our claim server runs on Render, which has an
   ephemeral disk; the Arkiv entity does not depend on it.

**What we kept off Arkiv, and why**
- **The photo itself:** it is on Lighthouse/0G storage. Arkiv is for small queryable records.
- **The permanent record:** Arkiv entities live about 182 days at most, so Postgres and the
  NFT contract remain the permanent source of truth.
- **Device private keys and secrets:** entities are public.
