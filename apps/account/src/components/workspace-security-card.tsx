"use client"

import type { Role } from "@repo/api-contract"
import { roleAtLeast } from "@repo/api-contract/roles"
import { Button } from "@repo/ui/components/button"
import { FormMessage, type FormState } from "@repo/ui/components/form-feedback"
import { Label } from "@repo/ui/components/label"
import { useTranslations } from "next-intl"
import { type Ref, useActionState, useEffect, useRef } from "react"
import { setWorkspaceSecurity } from "@/app/(account)/workspace/actions"
import type { WorkspaceSecurityState } from "@/lib/workspace-actions"

/** The checkbox's id (its label and hint hang off it). */
export const REQUIRE_TWO_FACTOR_ID = "require-two-factor"
/** The confirmation sentence's id; it takes focus when the confirmation replaces the form. */
export const REQUIRE_TWO_FACTOR_CONFIRM_ID = "require-two-factor-confirm"

/**
 * The Workspace page's **Security** card: whether every member must have two-step verification
 * (or a passkey) to open the workspace.
 *
 * - Owner: a checkbox and **Save security setting**. Unchecking applies at once; checking it is a
 *   two-step confirmation that works without JavaScript — the first submission only answers with
 *   how many members it would block (read from `workspaces.security.get` by the action, so the
 *   number is never stale), and the confirmation's own form carries `stage=confirm` to apply it,
 *   beside a **Keep it off** form carrying `stage=cancel`. An owner without two-step verification is
 *   refused by the api; that refusal links to `/security`.
 * - Admin: the state and the count, read-only.
 * - Below admin: the state only (`count` is never read for them — the api refuses it).
 */
export function WorkspaceSecurityCard({
  workspaceId,
  role,
  requireTwoFactor,
  membersWithoutTwoFactor,
  isImpersonating,
}: {
  workspaceId: number
  role: Role
  requireTwoFactor: boolean
  /** From `workspaces.security.get`; undefined below admin. */
  membersWithoutTwoFactor?: number
  isImpersonating: boolean
}) {
  const t = useTranslations("account.workspaceSecurity")
  const [state, action, pending] = useActionState(setWorkspaceSecurity, {
    ok: false,
  } as WorkspaceSecurityState)
  const confirmRef = useRef<HTMLParagraphElement>(null)
  const checkboxRef = useRef<HTMLInputElement>(null)
  const confirming = !state.ok && state.confirm !== undefined
  // The confirmation replaces the form holding focus (and Keep it off replaces the confirmation):
  // move focus to what took its place rather than let it fall to <body>.
  const wasConfirming = useRef(false)
  useEffect(() => {
    if (confirming) confirmRef.current?.focus()
    else if (wasConfirming.current) checkboxRef.current?.focus()
    wasConfirming.current = confirming
  }, [confirming])

  const status = <p>{t("status", { required: requireTwoFactor ? "yes" : "no" })}</p>
  const count =
    membersWithoutTwoFactor === undefined ? null : (
      <p className="text-muted-foreground">{t("count", { count: membersWithoutTwoFactor })}</p>
    )

  if (role !== "owner" || isImpersonating) {
    return (
      <div className="grid gap-1 px-6 py-4 text-sm">
        {status}
        {roleAtLeast(role, "admin") && count}
        <p className="text-muted-foreground">
          {isImpersonating && role === "owner" ? t("impersonating") : t("ownerOnly")}
        </p>
      </div>
    )
  }

  const message: FormState = state.ok ? state : { ok: false, message: state.message }
  return (
    <div className="grid gap-3 px-6 py-4 text-sm">
      {/* Always mounted, outside both steps, so its live regions exist before a message arrives. */}
      <FormMessage state={message} />
      {!state.ok && state.ownerTwoFactor && (
        <p>
          <a href="/security" className="underline underline-offset-4">
            {t("setUpOwn")}
          </a>
        </p>
      )}
      {!state.ok && state.confirm ? (
        <SecurityConfirm
          count={state.confirm.count}
          workspaceId={workspaceId}
          action={action}
          pending={pending}
          confirmRef={confirmRef}
        />
      ) : (
        <form action={action} className="grid gap-3">
          {status}
          {count}
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="stage" value="save" />
          <div className="flex items-start gap-2">
            {/* Keyed by the saved value, so an applied change re-mounts it with the new default. */}
            <input
              key={String(requireTwoFactor)}
              ref={checkboxRef}
              id={REQUIRE_TWO_FACTOR_ID}
              type="checkbox"
              name="requireTwoFactor"
              defaultChecked={requireTwoFactor}
              aria-describedby={`${REQUIRE_TWO_FACTOR_ID}-hint`}
              className="accent-primary mt-0.5 size-4"
            />
            <div className="grid gap-1">
              <Label htmlFor={REQUIRE_TWO_FACTOR_ID}>{t("label")}</Label>
              <p id={`${REQUIRE_TWO_FACTOR_ID}-hint`} className="text-muted-foreground text-xs">
                {t("hint")}
              </p>
            </div>
          </div>
          <div>
            <Button type="submit" variant="outline" size="sm" disabled={pending}>
              {pending ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

/**
 * The confirmation step: how many members turning the requirement on would block, then
 * **Turn on requirement** (its own form, `stage=confirm`) and **Keep it off** (its own form,
 * `stage=cancel`, so the two never share a `stage` field). Plain forms, so it works without
 * JavaScript; exported for its test, since `useActionState` cannot be driven in a server render.
 */
export function SecurityConfirm({
  count,
  workspaceId,
  action,
  pending,
  confirmRef,
}: {
  count: number
  workspaceId: number
  action: (payload: FormData) => void
  pending: boolean
  confirmRef?: Ref<HTMLParagraphElement>
}) {
  const t = useTranslations("account.workspaceSecurity")
  return (
    <div className="grid gap-3">
      <p id={REQUIRE_TWO_FACTOR_CONFIRM_ID} ref={confirmRef} tabIndex={-1} className="font-medium">
        {t("confirm", { count })}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <form action={action}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="requireTwoFactor" value="on" />
          <input type="hidden" name="stage" value="confirm" />
          <Button
            type="submit"
            size="sm"
            disabled={pending}
            aria-describedby={REQUIRE_TWO_FACTOR_CONFIRM_ID}
          >
            {pending ? t("turningOn") : t("turnOn")}
          </Button>
        </form>
        <form action={action}>
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="stage" value="cancel" />
          <Button type="submit" variant="ghost" size="sm" disabled={pending}>
            {t("keepOff")}
          </Button>
        </form>
      </div>
    </div>
  )
}
