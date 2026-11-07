import type { Migration } from "../migrate"

// Workspace activity log (Phase 12 A): the workspace an audit row belongs to, so a workspace's
// admins can read its administrative actions back. Nullable — platform rows (suspensions, job
// retries, impersonation itself) belong to no workspace — and no foreign key: a row outlives its
// workspace the way `actor_user_id` outlives a purged user. No backfill: before this column only
// impersonation-time rows named a workspace, so the log starts empty at deploy. The index serves
// the per-workspace list, newest first.
const auditWorkspace: Migration = {
  name: "0029_audit_workspace",
  async up(sql) {
    await sql.unsafe("ALTER TABLE audit_log ADD COLUMN workspace_id INTEGER")
    await sql.unsafe("CREATE INDEX audit_log_workspace ON audit_log (workspace_id, at)")
  },
}

export default auditWorkspace
