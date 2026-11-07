import type { Migration } from "../migrate"

// The invitation domain allowlist per workspace (Phase 12 C): a JSON array of A-label domains
// (`["acme.com","xn--bcher-kva.de"]`, normalised by `normalizeInviteDomain` in
// `@repo/api-contract/invite-domains`) that invitations are limited to. `'[]'`, every existing
// workspace's value, means any address — the behaviour before this column.
const workspaceInviteDomains: Migration = {
  name: "0031_workspace_invite_domains",
  async up(sql) {
    await sql.unsafe("ALTER TABLE workspaces ADD COLUMN invite_domains TEXT NOT NULL DEFAULT '[]'")
  },
}

export default workspaceInviteDomains
