"use client"

import { ASSIGNABLE_ROLES } from "@repo/api-contract/roles"
import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { invite } from "@/app/(account)/workspace/actions"
import { NativeSelect } from "@/components/native-select"
import type { FormState } from "@/lib/actions"

const prefix = "invite-"
const HINT_ID = "invite-email-hint"

export function InviteForm({
  workspaceId,
  full = false,
  limitedTo,
}: {
  workspaceId: number
  /** No seat left on the plan: informative only, the api refuses the invite too. */
  full?: boolean
  /** "Invitations are limited to: …", the workspace's allowed domains already formatted on the
   * server; undefined when any address may be invited. Informative: the api refuses the rest,
   * and its message shows above the form. */
  limitedTo?: string
}) {
  const t = useTranslations("account.invite")
  const tRoles = useTranslations("account.roles")
  const [state, action, pending] = useActionState(invite, { ok: false } as FormState)
  const values = state.ok ? undefined : state.values

  return (
    <form
      action={action}
      noValidate
      // wrap-anywhere: a long allowed domain in the hint or the api's refusal wraps at 320 px
      // rather than being clipped by the card (WCAG 1.4.10).
      className="grid gap-4 border-t px-6 py-5 wrap-anywhere"
    >
      <FormMessage state={state} />
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid gap-2">
          <Label htmlFor="invite-email">{t("email")}</Label>
          <Input
            id="invite-email"
            name="email"
            type="email"
            autoComplete="off"
            required
            defaultValue={values?.email ?? ""}
            {...fieldAria("email", state, limitedTo ? HINT_ID : undefined, { idPrefix: prefix })}
          />
          {limitedTo && (
            <p id={HINT_ID} className="text-muted-foreground text-xs">
              {limitedTo}
            </p>
          )}
          <FieldError name="email" state={state} idPrefix={prefix} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="invite-role">{t("role")}</Label>
          <NativeSelect
            id="invite-role"
            name="role"
            defaultValue={values?.role ?? "member"}
            {...fieldAria("role", state, undefined, { idPrefix: prefix })}
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {tRoles(r)}
              </option>
            ))}
          </NativeSelect>
          <FieldError name="role" state={state} idPrefix={prefix} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          type="submit"
          disabled={pending || full}
          aria-describedby={full ? "invite-full" : undefined}
        >
          {pending ? t("sending") : t("send")}
        </Button>
        {full && (
          <p id="invite-full" className="text-muted-foreground text-sm">
            {/* The api's SEAT_LIMIT_MESSAGE in English (a test keeps them equal), in the page's
                language here. */}
            {t("seatLimit")}.{" "}
            <Link href="/payments" className="text-foreground underline underline-offset-4">
              {t("changePlan")}
            </Link>
          </p>
        )}
      </div>
    </form>
  )
}
