"use client"

import type { User } from "@repo/api-contract"
import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { updateProfile } from "@/app/(account)/personal-info/actions"
import type { FormState } from "@/lib/actions"

export function NameForm({ user }: { user: Pick<User, "name"> }) {
  const t = useTranslations("account.name")
  const [state, action, pending] = useActionState(updateProfile, { ok: false } as FormState)

  return (
    <form action={action} noValidate className="grid gap-4 px-6 py-5">
      <FormMessage state={state} />
      <div className="grid gap-2">
        <Label htmlFor="name">{t("label")}</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          maxLength={100}
          defaultValue={state.ok ? user.name : (state.values?.name ?? user.name)}
          {...fieldAria("name", state, "name-hint")}
        />
        <p id="name-hint" className="text-muted-foreground text-xs">
          {t("hint")}
        </p>
        <FieldError name="name" state={state} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {t(pending ? "saving" : "save")}
        </Button>
      </div>
    </form>
  )
}
