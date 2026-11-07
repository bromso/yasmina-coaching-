"use client"

import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { requestMagicLink } from "@/app/login/actions"
import { FieldError, FormMessage, fieldAria } from "@/components/form-message"
import type { FormState } from "@/lib/actions"

/** The mailed link carries no `next`: a magic sign-in lands on `APP_URL`. */
export function MagicLinkForm() {
  const [state, action, pending] = useActionState(requestMagicLink, { ok: false } as FormState)
  const t = useTranslations("auth")

  return (
    // A second form with an "Email" field on the login page: name it apart from the password one.
    <form action={action} noValidate aria-label={t("magic.formLabel")}>
      <div className="grid gap-6">
        <FormMessage state={state} />
        <div className="grid gap-2">
          <Label htmlFor="magic-email">{t("common.email")}</Label>
          <Input
            id="magic-email"
            name="email"
            type="email"
            placeholder={t("common.emailPlaceholder")}
            autoComplete="username"
            required
            defaultValue={state.ok ? "" : state.values?.email}
            {...fieldAria("email", state, undefined, { idPrefix: "magic-" })}
          />
          <FieldError name="email" state={state} idPrefix="magic-" />
        </div>
        <Button type="submit" variant="outline" className="w-full" disabled={pending}>
          {pending ? t("magic.pending") : t("magic.submit")}
        </Button>
      </div>
    </form>
  )
}
