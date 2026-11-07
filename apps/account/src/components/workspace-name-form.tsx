"use client"

import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { renameWorkspace } from "@/app/(account)/workspace/actions"
import type { FormState } from "@/lib/actions"

const prefix = "workspace-"

export function WorkspaceNameForm({ name, workspaceId }: { name: string; workspaceId: number }) {
  const t = useTranslations("account.name")
  const [state, action, pending] = useActionState(renameWorkspace, { ok: false } as FormState)

  return (
    <form action={action} noValidate className="grid gap-4 px-6 py-5">
      <FormMessage state={state} />
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="grid gap-2">
        <Label htmlFor="workspace-name">{t("label")}</Label>
        <Input
          id="workspace-name"
          name="name"
          required
          maxLength={100}
          defaultValue={state.ok ? name : (state.values?.name ?? name)}
          {...fieldAria("name", state, undefined, { idPrefix: prefix })}
        />
        <FieldError name="name" state={state} idPrefix={prefix} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  )
}
