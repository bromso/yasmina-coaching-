"use client"

import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Label } from "@repo/ui/components/label"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { changePassword } from "@/app/(account)/security/actions"
import { PasswordInput } from "@/components/password-input"
import type { FormState } from "@/lib/actions"

export function PasswordForm({ email }: { email: string }) {
  const t = useTranslations("account.password")
  const [state, action, pending] = useActionState(changePassword, { ok: false } as FormState)

  return (
    // React resets the fields after every submit; passwords are never echoed back as `values`.
    <form action={action} noValidate className="grid gap-4 px-6 py-5">
      <FormMessage state={state} />
      {/* Tells a password manager whose password this is, so it updates the right entry. */}
      <input type="hidden" name="username" autoComplete="username" value={email} />
      <div className="grid gap-2">
        <Label htmlFor="currentPassword">{t("current")}</Label>
        <PasswordInput
          id="currentPassword"
          name="currentPassword"
          autoComplete="current-password"
          required
          {...fieldAria("currentPassword", state)}
        />
        <FieldError name="currentPassword" state={state} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="newPassword">{t("new")}</Label>
        <PasswordInput
          id="newPassword"
          name="newPassword"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          {...fieldAria("newPassword", state, "newPassword-hint")}
        />
        <p id="newPassword-hint" className="text-muted-foreground text-xs">
          {t("newHint")}
        </p>
        <FieldError name="newPassword" state={state} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="confirm">{t("confirm")}</Label>
        <PasswordInput
          id="confirm"
          name="confirm"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          {...fieldAria("confirm", state)}
        />
        <FieldError name="confirm" state={state} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {t(pending ? "changing" : "change")}
        </Button>
      </div>
    </form>
  )
}
