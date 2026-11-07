"use client"

import {
  APPLICATION_LINK_MAX,
  APPLICATION_NAME_MAX,
  APPLICATION_NOTE_MAX,
  CV_ACCEPT,
  CV_UPLOAD_MESSAGE,
  MAX_CV_BYTES,
} from "@repo/api-contract/jobs-limits"
import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import type { ChangeEvent } from "react"
import { useActionState, useState } from "react"
import type { ApplyFormState } from "@/app/[slug]/apply/actions"
import { submitApplication } from "@/app/[slug]/apply/actions"

const initialState: ApplyFormState = { ok: false }

export type ApplyFormProps = {
  /** `/<slug>`: the posting's slug, carried as a hidden field — the title and openness are
   * re-checked from the build on the server, never trusted from this form. */
  slug: string
}

/**
 * The apply form (`/<slug>/apply`): name, email, a required PDF CV, an optional link and note,
 * a required consent checkbox, and a hidden honeypot (`hp_field`) real visitors never see or
 * fill. Works without JavaScript — a full-page reload repopulates every text field from
 * `state.values`, since this app ships no root loading boundary (see CLAUDE.md's "Status
 * pages"). The consent checkbox is a native `<input type="checkbox">`, not the Radix `Checkbox`:
 * that one submits its value only once hydrated.
 */
export function ApplyForm({ slug }: ApplyFormProps) {
  const [state, action, pending] = useActionState(submitApplication, initialState)
  const [clientError, setClientError] = useState<string>()

  function onCvChange(e: ChangeEvent<HTMLInputElement>) {
    setClientError(undefined)
    const file = e.target.files?.[0]
    if (file && file.size > MAX_CV_BYTES) setClientError(CV_UPLOAD_MESSAGE)
  }

  const cvAria = fieldAria("cv", state, "cv-hint")
  const cvInvalid = Boolean(clientError) || cvAria["aria-invalid"] === true
  const cvDescribedBy = clientError ? "cv-hint cv-client-error" : cvAria["aria-describedby"]

  return (
    <form action={action} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="job" value={slug} />

      {/* Honeypot: off-screen (not `display:none`, which some bots skip over), out of the
          accessibility tree and the tab order — see `apps/help/src/components/contact-form.tsx`
          for the full reasoning. A bot that fills every field it finds trips this one and gets a
          quiet, fake-free success instead of a real application. */}
      <div className="sr-only" aria-hidden="true">
        <Label htmlFor="hp_field">Leave this field empty</Label>
        <Input id="hp_field" name="hp_field" tabIndex={-1} autoComplete="new-password" />
      </div>

      <FormMessage state={state} />
      <FieldError name="job" state={state} />

      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={APPLICATION_NAME_MAX}
          autoComplete="name"
          defaultValue={state.ok ? "" : state.values?.name}
          {...fieldAria("name", state)}
        />
        <FieldError name="name" state={state} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.ok ? "" : state.values?.email}
          {...fieldAria("email", state)}
        />
        <FieldError name="email" state={state} />
      </div>

      <div className="grid grid-cols-1 gap-2">
        <Label htmlFor="cv">CV (PDF, up to 5 MB)</Label>
        <input
          id="cv"
          type="file"
          name="cv"
          accept={CV_ACCEPT}
          required
          onChange={onCvChange}
          aria-invalid={cvInvalid ? true : undefined}
          aria-describedby={cvDescribedBy}
          className="w-full min-w-0 max-w-full text-sm"
        />
        <p id="cv-hint" className="text-muted-foreground text-xs">
          A PDF only, up to 5 MB.
        </p>
        {clientError ? (
          <p id="cv-client-error" className="text-destructive text-sm">
            {clientError}
          </p>
        ) : (
          <FieldError name="cv" state={state} />
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="link">Link (optional)</Label>
        <Input
          id="link"
          name="link"
          type="url"
          placeholder="https://"
          maxLength={APPLICATION_LINK_MAX}
          defaultValue={state.ok ? "" : state.values?.link}
          {...fieldAria("link", state, "link-hint")}
        />
        <p id="link-hint" className="text-muted-foreground text-xs">
          A portfolio, GitHub profile or LinkedIn — must start with https://.
        </p>
        <FieldError name="link" state={state} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="note">Note (optional)</Label>
        <Textarea
          id="note"
          name="note"
          rows={5}
          maxLength={APPLICATION_NOTE_MAX}
          defaultValue={state.ok ? "" : state.values?.note}
          {...fieldAria("note", state)}
        />
        <FieldError name="note" state={state} />
      </div>

      <div className="flex items-start gap-2">
        {/* Native, not the Radix Checkbox: that one submits its value only once hydrated — see
            `apps/auth/src/components/admin/revoke-sessions-form.tsx`. */}
        <input
          type="checkbox"
          id="consent"
          name="consent"
          value="yes"
          required
          defaultChecked={state.ok ? false : state.values?.consent === "yes"}
          className="mt-1 size-4 accent-primary"
          aria-invalid={!state.ok && state.fieldErrors?.consent ? true : undefined}
          aria-describedby={!state.ok && state.fieldErrors?.consent ? "consent-error" : undefined}
        />
        <Label htmlFor="consent" className="font-normal">
          I agree that my application is stored for 6 months so it can be assessed.
        </Label>
      </div>
      <FieldError name="consent" state={state} />

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Sending…" : "Apply"}
      </Button>
    </form>
  )
}
