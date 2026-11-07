"use client"

import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { createWorkspace } from "@/app/workspaces/new/actions"
import type { CreateResult } from "@/lib/workspace-actions"

/** Names a new workspace; on success the action makes it current and moves on to /notes. */
export function WorkspaceForm() {
  const t = useTranslations("app.workspaceNew")
  const [state, action, pending] = useActionState(createWorkspace, { ok: false } as CreateResult)
  // React resets the form after every action; defaultValue brings the typed name back on error.
  const values = state.ok ? undefined : state.values

  return (
    <form action={action} noValidate className="grid gap-4">
      <FormMessage state={state} />
      <div className="grid gap-2">
        <Label htmlFor="name">{t("name")}</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={100}
          autoComplete="organization"
          defaultValue={values?.name}
          {...fieldAria("name", state)}
        />
        <FieldError name="name" state={state} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {t(pending ? "creating" : "create")}
        </Button>
      </div>
    </form>
  )
}
