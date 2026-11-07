"use client"

import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { setInviteDomains } from "@/app/(account)/workspace/actions"
import type { FormState } from "@/lib/actions"

/** The textarea's id (its label, hint and error hang off it). */
export const INVITE_DOMAINS_ID = "invite-domains"
const HINT_ID = `${INVITE_DOMAINS_ID}-hint`
const prefix = "invite-domains-"

/**
 * The Security card's **Invitation domains** section, for the owner: one domain per line and
 * **Save invitation domains**. A plain form, so it works without JavaScript. `domains` is the
 * stored list already in its readable (Unicode) form — converted on the server, since the browser
 * has no `domainToUnicode`; whatever the textarea holds is sent as typed and normalised by the api.
 */
export function InviteDomainsForm({
  workspaceId,
  domains,
}: {
  workspaceId: number
  domains: string[]
}) {
  const t = useTranslations("account.inviteDomains")
  const [state, action, pending] = useActionState(setInviteDomains, { ok: false } as FormState)
  const saved = domains.join("\n")
  // A refusal keeps what was typed (React resets the form to its defaults after the action);
  // otherwise the saved list, re-mounted whenever a save changes it.
  const value = state.ok ? undefined : state.values?.domains

  return (
    <form
      action={action}
      noValidate
      // wrap-anywhere: a long domain in the success message wraps at 320 px (WCAG 1.4.10).
      className="grid gap-3 border-t px-6 py-4 text-sm wrap-anywhere"
    >
      <h3 className="font-medium">{t("title")}</h3>
      <FormMessage state={state} />
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="grid gap-2">
        <Label htmlFor={INVITE_DOMAINS_ID}>{t("label")}</Label>
        <Textarea
          key={saved}
          id={INVITE_DOMAINS_ID}
          name="domains"
          rows={4}
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          defaultValue={value ?? saved}
          {...fieldAria("domains", state, HINT_ID, { idPrefix: prefix })}
        />
        <p id={HINT_ID} className="text-muted-foreground text-xs">
          {t("hint")}
        </p>
        <FieldError name="domains" state={state} idPrefix={prefix} />
      </div>
      <div>
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  )
}
