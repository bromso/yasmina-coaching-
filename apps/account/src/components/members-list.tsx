"use client"

import type { Member, Role } from "@repo/api-contract"
import { ASSIGNABLE_ROLES, roleAtLeast } from "@repo/api-contract/roles"
import { formatUtcDate } from "@repo/i18n/dates"
import type { Locale } from "@repo/i18n/locales"
import { Badge } from "@repo/ui/components/badge"
import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { NativeSelect } from "@repo/ui/components/native-select"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { leave, removeMember, setRole } from "@/app/(account)/workspace/actions"
import type { FormState } from "@/lib/actions"

export function MembersList({
  members,
  currentUserId,
  role,
  workspaceId,
  locale,
}: {
  members: Member[]
  currentUserId: number
  /** The caller's role in this workspace. */
  role: Role
  /** The workspace these forms were rendered for; the actions refuse any other. */
  workspaceId: number
  /** The page's language: the join dates print in it, in UTC (server and hydration agree). */
  locale: Locale
}) {
  const t = useTranslations("account.members")
  const tRoles = useTranslations("account.roles")
  const initial = { ok: false } as FormState
  const [roleState, setRoleAction, settingRole] = useActionState(setRole, initial)
  const [removed, removeAction, removing] = useActionState(removeMember, initial)
  const [left, leaveAction, leaving] = useActionState(leave, initial)
  const busy = settingRole || removing || leaving
  const isAdmin = roleAtLeast(role, "admin")
  const isOwner = role === "owner"

  return (
    <>
      {/* Always mounted, so the live regions inside it exist before a message arrives. */}
      <div
        className={
          roleState.message || removed.message || left.message ? "grid gap-2 px-6 py-4" : undefined
        }
      >
        <FormMessage state={roleState} />
        <FormMessage state={removed} />
        <FormMessage state={left} />
      </div>
      <ul className="flex flex-col divide-y">
        {members.map((member) => {
          const self = member.userId === currentUserId
          // Only an owner sees controls on an owner's row.
          const manageable = isAdmin && (member.role !== "owner" || isOwner)
          // Owner is made by a transfer, never set here: an owner's role reads as text.
          const canSetRole = manageable && member.role !== "owner"
          const nameId = `member-${member.userId}-name`
          const roleId = `member-${member.userId}-role`
          const display = member.name || member.email || t("unnamed")
          return (
            <li
              key={member.userId}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 text-sm"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="flex min-w-0 items-center gap-2">
                  <span id={nameId} className="truncate font-medium">
                    {display}
                  </span>
                  {self && <Badge variant="secondary">{t("you")}</Badge>}
                  {/* `twoFactor` is null below admin: the api never tells a viewer or member. */}
                  {member.twoFactor === false && <Badge variant="outline">{t("noTwoStep")}</Badge>}
                </span>
                <span className="text-muted-foreground truncate text-xs">
                  {member.name && member.email ? `${member.email} · ` : ""}
                  {t("joined", { date: formatUtcDate(member.joinedAt, locale) })}
                </span>
              </div>
              {canSetRole ? (
                <form action={setRoleAction} className="flex items-center gap-2">
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <input type="hidden" name="userId" value={member.userId} />
                  <label htmlFor={roleId} className="sr-only">
                    {t("roleFor", { name: display })}
                  </label>
                  {/* Keyed by the role, so a saved change re-mounts it with the new default. */}
                  <NativeSelect
                    className="w-auto"
                    key={member.role}
                    id={roleId}
                    name="role"
                    defaultValue={member.role}
                    disabled={busy}
                  >
                    {ASSIGNABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {tRoles(r)}
                      </option>
                    ))}
                  </NativeSelect>
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    aria-describedby={nameId}
                  >
                    {t("saveRole")}
                  </Button>
                </form>
              ) : (
                <span className="text-muted-foreground">{tRoles(member.role)}</span>
              )}
              {self ? (
                <form action={leaveAction}>
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <Button type="submit" variant="outline" size="sm" disabled={busy}>
                    {leaving ? t("leaving") : t("leave")}
                  </Button>
                </form>
              ) : (
                manageable && (
                  <form action={removeAction}>
                    <input type="hidden" name="workspaceId" value={workspaceId} />
                    <input type="hidden" name="userId" value={member.userId} />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      aria-describedby={nameId}
                    >
                      {t("remove")}
                    </Button>
                  </form>
                )
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
