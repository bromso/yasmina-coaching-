import {
  type AdminUserDetail,
  SUPERADMIN_REMOVE_PASSKEYS_MESSAGE,
  SUPERADMIN_RESET_MESSAGE,
  SUPERADMIN_SUSPEND_MESSAGE,
} from "@repo/api-contract"
import { Badge } from "@repo/ui/components/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { initialsOf } from "@repo/ui/lib/initials"
import Link from "next/link"
import { AdminNav } from "@/components/admin/admin-nav"
import { AuditTable } from "@/components/admin/audit-table"
import { ImpersonateForm } from "@/components/admin/impersonate-form"
import { RemovePasskeysForm } from "@/components/admin/remove-passkeys-form"
import { ResetTwoFactorForm } from "@/components/admin/reset-two-factor-form"
import { RevokeSessionsForm } from "@/components/admin/revoke-sessions-form"
import { SuspensionForm } from "@/components/admin/suspend-form"
import { formatDateTime, suspendUntilBounds } from "@/lib/admin"

export function AdminUserView({ user, isSelf }: { user: AdminUserDetail; isSelf: boolean }) {
  const disabledReason = isSelf
    ? "This is you"
    : user.superadmin
      ? "Superadmins cannot be impersonated"
      : undefined
  const resetDisabledReason = isSelf
    ? "This is you"
    : user.superadmin
      ? SUPERADMIN_RESET_MESSAGE
      : undefined
  const removePasskeysDisabledReason = isSelf
    ? "This is you"
    : user.superadmin
      ? SUPERADMIN_REMOVE_PASSKEYS_MESSAGE
      : undefined
  const suspendDisabledReason = isSelf
    ? "This is you"
    : user.superadmin
      ? SUPERADMIN_SUSPEND_MESSAGE
      : undefined
  const { min: suspendMin, max: suspendMax } = suspendUntilBounds()
  return (
    <>
      <div className="flex items-center gap-3">
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            width={40}
            height={40}
            alt=""
            className="size-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="bg-primary text-primary-foreground flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-medium"
          >
            {initialsOf(user)}
          </span>
        )}
        <h1 className="text-2xl font-semibold">{user.name || user.email}</h1>
      </div>
      <AdminNav current="/admin/users" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card size="compact">
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-2 break-words text-sm">
              <dt className="text-muted-foreground">Verified</dt>
              <dd>{user.emailVerified ? "Yes" : "No"}</dd>
              <dt className="text-muted-foreground">Sign-in</dt>
              <dd>
                {[user.hasPassword ? "password" : null, ...user.providers]
                  .filter(Boolean)
                  .join(", ") || "none"}
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>
                <time dateTime={user.createdAt}>{formatDateTime(user.createdAt)}</time>
              </dd>
              <dt className="text-muted-foreground">Role</dt>
              <dd>{user.superadmin ? <Badge variant="secondary">superadmin</Badge> : "user"}</dd>
              {user.deletionScheduledAt && (
                <>
                  <dt className="text-muted-foreground">Deletion</dt>
                  <dd>
                    Scheduled for deletion on{" "}
                    <time dateTime={user.deletionScheduledAt}>
                      {formatDateTime(user.deletionScheduledAt)}
                    </time>
                  </dd>
                </>
              )}
            </dl>
          </CardContent>
        </Card>
        <Card size="compact">
          <CardHeader>
            <CardTitle>Sessions</CardTitle>
            <CardDescription>
              {user.sessions.count} active · last seen{" "}
              {user.sessions.lastSeenAt ? formatDateTime(user.sessions.lastSeenAt) : "never"} ·
              impersonated {user.sessions.impersonations} time
              {user.sessions.impersonations === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isSelf ? (
              <p className="text-muted-foreground text-sm">This is you</p>
            ) : (
              <RevokeSessionsForm userId={user.id} />
            )}
          </CardContent>
        </Card>
        <Card size="compact">
          <CardHeader>
            <CardTitle>Workspaces</CardTitle>
          </CardHeader>
          <CardContent>
            {user.memberships.length === 0 ? (
              <p className="text-muted-foreground text-sm">No workspaces.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {user.memberships.map((m) => (
                  <li key={m.workspace.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/admin/workspaces/${m.workspace.id}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {m.workspace.name}
                    </Link>
                    <span className="text-muted-foreground">
                      {m.role} · {m.plan}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card size="compact">
          <CardHeader>
            <CardTitle>Impersonate</CardTitle>
            <CardDescription>
              A one-hour session as this user, recorded in the audit log.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ImpersonateForm userId={user.id} disabledReason={disabledReason} />
          </CardContent>
        </Card>
        <Card size="compact">
          <CardHeader>
            <CardTitle>Suspension</CardTitle>
            <CardDescription>
              Stops the account from signing in; everything else (workspaces, billing, memberships)
              keeps working.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-2 break-words text-sm">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                {!user.suspended ? "Not suspended" : user.suspended.active ? "Active" : "Expired"}
              </dd>
              {user.suspended && (
                <>
                  <dt className="text-muted-foreground">Reason</dt>
                  <dd>{user.suspended.reason}</dd>
                  <dt className="text-muted-foreground">Until</dt>
                  <dd>
                    {user.suspended.until ? (
                      <time dateTime={user.suspended.until}>
                        {formatDateTime(user.suspended.until)}
                      </time>
                    ) : (
                      "Indefinite"
                    )}
                  </dd>
                  <dt className="text-muted-foreground">By</dt>
                  <dd>{user.suspended.by?.email ?? "Unknown (account purged)"}</dd>
                </>
              )}
            </dl>
            <SuspensionForm
              userId={user.id}
              record={!user.suspended ? "none" : user.suspended.active ? "active" : "expired"}
              minDate={suspendMin}
              maxDate={suspendMax}
              disabledReason={suspendDisabledReason}
            />
          </CardContent>
        </Card>
        {user.twoFactorEnabled && (
          <Card size="compact">
            <CardHeader>
              <CardTitle>Two-step verification</CardTitle>
              <CardDescription>
                Turns it off and signs the user out everywhere — for a lost phone with no recovery
                codes left.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ResetTwoFactorForm userId={user.id} disabledReason={resetDisabledReason} />
            </CardContent>
          </Card>
        )}
        <Card size="compact">
          <CardHeader>
            <CardTitle>Passkeys</CardTitle>
            <CardDescription>
              {user.passkeys} passkey{user.passkeys === 1 ? "" : "s"} registered
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user.passkeys === 0 ? (
              <p className="text-muted-foreground text-sm">No passkeys.</p>
            ) : (
              <RemovePasskeysForm userId={user.id} disabledReason={removePasskeysDisabledReason} />
            )}
          </CardContent>
        </Card>
      </div>
      <section aria-labelledby="recent-audit" className="grid grid-cols-1 gap-3">
        <h2 id="recent-audit" className="text-lg font-medium">
          Recent audit entries
        </h2>
        <AuditTable items={user.audit} caption={`Audit entries for ${user.email}`} />
        <Link
          href={`/admin/audit?targetType=user&targetId=${user.id}`}
          className="text-sm underline underline-offset-4"
        >
          All entries for this user
        </Link>
      </section>
    </>
  )
}
