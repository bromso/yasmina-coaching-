import type { Migration } from "../migrate"

// One identity per provider per user: a second would slip past the disconnect guard (which counts
// rows) and disconnect, which deletes by provider, would then remove both. A plain unique index
// works on both engines, so no table rebuild.
const identityPerProvider: Migration = {
  name: "0006_identity_per_provider",
  async up(sql) {
    await sql.unsafe(
      "CREATE UNIQUE INDEX identities_user_provider ON identities (user_id, provider)"
    )
  },
}

export default identityPerProvider
