"use client"

import { SUPPORT_TOPICS, type SupportTopic } from "@repo/api-contract/support-limits"
import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import { useSearchParams } from "next/navigation"
import { Suspense, useActionState } from "react"
import type { ContactFormState } from "@/app/contact/actions"
import { submitContact } from "@/app/contact/actions"

const TOPIC_LABELS: Record<SupportTopic, string> = {
  account: "Account",
  billing: "Billing",
  bug: "Something isn't working",
  other: "Something else",
}

const selectClass =
  "border-input h-9 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 md:text-sm"

const initialState: ContactFormState = { ok: false }

/**
 * `?from=<help path>` as the hidden `page` field's value, read only once hydrated so the page
 * around it stays static. The fallback below (shown in the static HTML and until hydration) is
 * an empty, otherwise identical hidden field — the form still submits fine without it, just with
 * no page context attached.
 */
function PageField() {
  const searchParams = useSearchParams()
  return <input type="hidden" name="page" value={searchParams.get("from") ?? ""} readOnly />
}

/**
 * The help center's contact form: email, an optional name, a topic, a message, and a hidden
 * honeypot (`hp_field`) real visitors never see or fill. Works without JavaScript — a full-page
 * reload repopulates every field from `state.values`, since this app ships no root loading
 * boundary (see CLAUDE.md's "Status pages").
 */
export function ContactForm() {
  const [state, action, pending] = useActionState(submitContact, initialState)

  return (
    <form action={action} noValidate className="flex flex-col gap-6">
      <Suspense fallback={<input type="hidden" name="page" value="" readOnly />}>
        <PageField />
      </Suspense>
      {/* Honeypot: moved off-screen (not `display:none`, which some bots skip over) rather than
          removed from layout, so a bot that reads computed styles still finds and fills it;
          `aria-hidden` takes it out of the accessibility tree and `tabIndex={-1}` out of the tab
          order, so a real visitor — sighted or not — never encounters it. Named `hp_field` rather
          than something autofill-prone like `website`, and `autoComplete="new-password"` (browsers
          and password managers never autofill that into a plain text field), so a real visitor's
          saved data cannot fill it and trip the trap by accident. A bot that fills every field it
          finds trips this one and gets a quiet, fake-free success instead of a real submission. */}
      <div className="sr-only" aria-hidden="true">
        <Label htmlFor="hp_field">Leave this field empty</Label>
        <Input id="hp_field" name="hp_field" tabIndex={-1} autoComplete="new-password" />
      </div>

      <FormMessage state={state} />

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

      <div className="grid gap-2">
        <Label htmlFor="name">Name (optional)</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          defaultValue={state.ok ? "" : state.values?.name}
          {...fieldAria("name", state)}
        />
        <FieldError name="name" state={state} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="topic">Topic</Label>
        <select
          id="topic"
          name="topic"
          required
          defaultValue={state.ok ? "" : (state.values?.topic ?? "")}
          className={selectClass}
          {...fieldAria("topic", state)}
        >
          <option value="" disabled>
            Choose a topic
          </option>
          {SUPPORT_TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {TOPIC_LABELS[topic]}
            </option>
          ))}
        </select>
        <FieldError name="topic" state={state} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="message">Message</Label>
        <Textarea
          id="message"
          name="message"
          required
          rows={6}
          defaultValue={state.ok ? "" : state.values?.message}
          {...fieldAria("message", state)}
        />
        <FieldError name="message" state={state} />
      </div>

      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Sending…" : "Send"}
      </Button>
    </form>
  )
}
