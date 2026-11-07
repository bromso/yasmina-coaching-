import type { Migration } from "../migrate"

// Enforced two-step verification per workspace (Phase 12 B): when set, a member whose account has
// neither two-step verification on nor a passkey is refused by every workspace-scoped procedure
// and the realtime stream (see `member(min)` in router.ts) until they set one up. The repo's
// boolean pattern on both engines: INTEGER 0/1 with a CHECK, like `webhook_endpoints.enabled`.
const workspaceRequireTwoFactor: Migration = {
  name: "0030_workspace_require_two_factor",
  async up(sql) {
    await sql.unsafe(
      "ALTER TABLE workspaces ADD COLUMN require_two_factor INTEGER NOT NULL DEFAULT 0 CHECK (require_two_factor IN (0, 1))"
    )
  },
}

export default workspaceRequireTwoFactor
