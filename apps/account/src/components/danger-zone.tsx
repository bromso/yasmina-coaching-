"use client"

import type { Member } from "@repo/api-contract"
import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { useTranslations } from "next-intl"
import { useActionState, useState, useSyncExternalStore } from "react"
import { deleteWorkspace, transferOwnership } from "@/app/(account)/workspace/actions"
import { NativeSelect } from "@/components/native-select"
import type { FormState } from "@/lib/actions"

const prefix = "delete-"
const subscribeNever = () => () => {}

/** Owner-only: hand the workspace to another member, or delete it. */
export function DangerZone({
  name,
  others,
  workspaceId,
}: {
  name: string
  others: Member[]
  workspaceId: number
}) {
  const t = useTranslations("account.dangerZone")
  const tMembers = useTranslations("account.members")
  const initial = { ok: false } as FormState
  const [transferred, transferAction, transferring] = useActionState(transferOwnership, initial)
  const [deleted, deleteAction, deleting] = useActionState(deleteWorkspace, initial)
  // The server re-checks the typed name against the workspace it resolved; this only gates the button.
  const [typed, setTyped] = useState("")
  // False in the server HTML, true once hydrated: without JavaScript the button stays usable and
  // the server's "Type the workspace name to confirm" is the gate.
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  )

  return (
    <>
      <form action={transferAction} className="grid gap-4 px-6 py-5">
        <FormMessage state={transferred} />
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <div className="grid gap-2">
          <Label htmlFor="transfer-member">{t("transfer")}</Label>
          <NativeSelect
            id="transfer-member"
            name="userId"
            required
            defaultValue=""
            disabled={others.length === 0}
            aria-describedby="transfer-hint"
          >
            <option value="" disabled>
              {t("chooseMember")}
            </option>
            {others.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.name || m.email || tMembers("unnamed")}
              </option>
            ))}
          </NativeSelect>
          <p id="transfer-hint" className="text-muted-foreground text-xs">
            {others.length === 0 ? t("noOne") : t("transferHint")}
          </p>
        </div>
        <div>
          <Button type="submit" variant="outline" disabled={transferring || others.length === 0}>
            {transferring ? t("transferring") : t("transfer")}
          </Button>
        </div>
      </form>
      <form action={deleteAction} noValidate className="grid gap-4 px-6 py-5">
        <FormMessage state={deleted} />
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <div className="grid gap-2">
          <Label htmlFor="delete-confirm">
            {t.rich("deleteLabel", {
              workspace: name,
              name: (chunks) => <span className="font-semibold">{chunks}</span>,
            })}
          </Label>
          <Input
            id="delete-confirm"
            name="confirm"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            {...fieldAria("confirm", deleted, "delete-hint", { idPrefix: prefix })}
          />
          <p id="delete-hint" className="text-muted-foreground text-xs">
            {t("deleteHint")}
          </p>
          <FieldError name="confirm" state={deleted} idPrefix={prefix} />
        </div>
        <div>
          <Button
            type="submit"
            variant="destructive"
            disabled={deleting || (hydrated && typed.trim() !== name)}
          >
            {deleting ? t("deleting") : t("delete")}
          </Button>
        </div>
      </form>
    </>
  )
}
