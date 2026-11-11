"use client"

import {
  LEAD_AUDIENCES,
  LEAD_CONTACT_METHODS,
  LEAD_MESSAGE_MAX,
  LEAD_NAME_MAX,
  LEAD_NEEDS,
  LEAD_ORGANISATION_MAX,
  LEAD_PHONE_MAX,
  LEAD_ROLE_MAX,
  LEAD_TIMELINES,
  type LeadAudience,
} from "@repo/api-contract/leads"
import type { Locale } from "@repo/i18n/locales"
import { Button } from "@repo/ui/components/button"
import {
  FieldError,
  FormMessage,
  type FormState,
  fieldAria,
} from "@repo/ui/components/form-feedback"
import { Icon } from "@repo/ui/components/icon"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import { type FormEvent, useActionState, useEffect, useState } from "react"
import { sendLead } from "@/app/actions"
import { choiceClass, choiceInputClass, Fieldset, value } from "@/components/booking/details-fields"
import { StepIndicator } from "@/components/booking/step-indicator"
import { fieldText, primaryClass, StepNav, StepPanel } from "@/components/booking/step-panel"
import { useBookingSteps } from "@/components/booking/use-booking-steps"
import { CONTACT } from "@/content/contact"
import { cn } from "@/lib/utils"

type ContactFormProps = {
  locale: Locale
  /** The www page the visitor came from (`?from=`), checked by the page; sent as `page`. */
  page: string
}

const initialState: FormState = { ok: false }

/** Each step's fields, so a refusal from the server reopens the step that holds the field. */
const STEP_FIELDS = [
  ["audience"],
  ["need", "timeline", "message"],
  ["name", "email", "phone", "organisation", "role", "contactMethod", "consent", "newsletter"],
]

/**
 * Without JavaScript every step shows at once, as one long form with its submit button at the end;
 * the stepper and the Continue / Back rows (which need JavaScript) are left out, and the
 * organisation fields show whatever was picked (the server ignores them for a private person).
 */
const NO_SCRIPT_CSS =
  ".step-panel{display:grid!important}.step-nav,.step-indicator{display:none!important}.org-fields{display:grid!important}.org-only{display:block!important}"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * The contact form, in three steps (who, what and how soon, contact details) before
 * `/kontakt/tack`, reusing the booking journey's stepper and step helpers. Still a plain
 * `<form action>` that works without JavaScript; the browser checks each step before the next,
 * and the server checks everything again.
 */
export function ContactForm({ locale, page }: ContactFormProps) {
  const copy = CONTACT[locale].form
  const [state, action, pending] = useActionState(sendLead, initialState)
  const [audience, setAudience] = useState<LeadAudience | "">(
    () => (value(state, "audience") as LeadAudience) || ""
  )
  const { step, goTo, formRef, shown, fail, onSubmit, stepClick } = useBookingSteps({
    state,
    pending,
    fields: STEP_FIELDS,
    directSubmitStep: 3,
  })
  // A refusal re-renders with what was posted: the organisation fields follow that answer.
  useEffect(() => {
    const posted = value(state, "audience")
    if (posted === "private" || posted === "organisation") setAudience(posted)
  }, [state])

  const checked = (form: HTMLFormElement | null, name: string) =>
    Boolean(form?.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`))

  const toStep2 = () => {
    if (!fail(checked(formRef.current, "audience") ? {} : { audience: copy.check.audience })) {
      goTo(2)
    }
  }
  const toStep3 = () => {
    const form = formRef.current
    const errors: Record<string, string> = {}
    if (!checked(form, "need")) errors.need = copy.check.need
    if (!checked(form, "timeline")) errors.timeline = copy.check.timeline
    if (fieldText(form, "message").length > LEAD_MESSAGE_MAX) errors.message = copy.check.message
    if (!fail(errors)) goTo(3)
  }
  const send = (event: FormEvent<HTMLFormElement>) => {
    if (step === 3) {
      const form = formRef.current
      const errors: Record<string, string> = {}
      if (!fieldText(form, "name")) errors.name = copy.check.name
      if (!EMAIL.test(fieldText(form, "email"))) errors.email = copy.check.email
      if (audience === "organisation" && !fieldText(form, "organisation")) {
        errors.organisation = copy.check.organisation
      }
      const phone = form?.querySelector<HTMLInputElement>('input[name="contactMethod"]:checked')
      if (phone?.value === "phone" && !fieldText(form, "phone")) errors.phone = copy.check.phone
      if (!checked(form, "consent")) errors.consent = copy.check.consent
      if (fail(errors)) {
        event.preventDefault()
        return
      }
    }
    onSubmit(event)
  }

  const radios = <T extends string>(
    name: string,
    options: readonly T[],
    labels: Record<T, string>,
    extra?: { hints?: Record<T, string>; onChange?: (v: T) => void; controlled?: T | "" }
  ) => (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((option) => (
        <label key={option} className={choiceClass}>
          <input
            type="radio"
            name={name}
            value={option}
            {...(extra?.controlled !== undefined
              ? { checked: extra.controlled === option, onChange: () => extra.onChange?.(option) }
              : { defaultChecked: value(state, name) === option })}
            className={choiceInputClass}
          />
          {extra?.hints ? (
            <span className="grid">
              <span className="font-medium">{labels[option]}</span>
              <span className="text-muted-foreground text-xs">{extra.hints[option]}</span>
            </span>
          ) : (
            labels[option]
          )}
        </label>
      ))}
    </div>
  )

  return (
    <form
      ref={formRef}
      action={action}
      noValidate
      className="grid grid-cols-1 gap-8"
      // Enter in a field of an earlier step never sends the form early.
      onSubmit={send}
    >
      <noscript>
        <style>{NO_SCRIPT_CSS}</style>
      </noscript>
      <StepIndicator
        steps={copy.steps}
        current={step}
        stepOf={copy.stepOf}
        doneLabel={copy.stepper.done}
        onStepClick={stepClick}
      />
      <FormMessage state={state} />
      <input type="hidden" name="page" value={page} />

      <StepPanel n={1} active={step === 1} heading={copy.steps[0]}>
        <Fieldset
          legend={copy.audience.legend}
          error={<FieldError name="audience" state={shown} />}
          className="[&>legend]:sr-only"
        >
          {radios("audience", LEAD_AUDIENCES, copy.audience.labels, {
            hints: copy.audience.hints,
            controlled: audience,
            onChange: setAudience,
          })}
        </Fieldset>
        <StepNav backLabel={copy.stepper.back}>
          <Button type="button" size="lg" className={primaryClass} onClick={toStep2}>
            {copy.continueLabel}
            <Icon icon="lucide:arrow-right" aria-hidden="true" />
          </Button>
        </StepNav>
      </StepPanel>

      <StepPanel n={2} active={step === 2} heading={copy.steps[1]}>
        <Fieldset legend={copy.need.legend} error={<FieldError name="need" state={shown} />}>
          {radios("need", LEAD_NEEDS, copy.need.labels)}
        </Fieldset>
        <Fieldset
          legend={copy.timeline.legend}
          error={<FieldError name="timeline" state={shown} />}
        >
          {radios("timeline", LEAD_TIMELINES, copy.timeline.labels)}
        </Fieldset>
        <div className="grid gap-2">
          <Label htmlFor="message">{copy.message.label}</Label>
          <p id="message-hint" className="text-muted-foreground text-sm">
            {copy.message.hint}
          </p>
          <Textarea
            id="message"
            name="message"
            rows={5}
            maxLength={LEAD_MESSAGE_MAX}
            defaultValue={value(state, "message")}
            {...fieldAria("message", shown, "message-hint")}
          />
          <FieldError name="message" state={shown} />
        </div>
        <StepNav backLabel={copy.stepper.back} onBack={() => goTo(1)}>
          <Button type="button" size="lg" className={primaryClass} onClick={toStep3}>
            {copy.continueLabel}
            <Icon icon="lucide:arrow-right" aria-hidden="true" />
          </Button>
        </StepNav>
      </StepPanel>

      <StepPanel n={3} active={step === 3} heading={copy.steps[2]}>
        <TextField
          name="name"
          label={copy.fields.name}
          state={shown}
          max={LEAD_NAME_MAX}
          auto="name"
          required
        />
        <TextField
          name="email"
          label={copy.fields.email}
          state={shown}
          type="email"
          auto="email"
          required
        />
        <div className={cn("org-fields grid gap-6", audience !== "organisation" && "hidden")}>
          <p className="org-only hidden text-muted-foreground text-sm">
            {copy.fields.organisationOnly}
          </p>
          <TextField
            name="organisation"
            label={copy.fields.organisation}
            state={shown}
            max={LEAD_ORGANISATION_MAX}
            auto="organization"
          />
          <TextField
            name="role"
            label={copy.fields.role}
            state={shown}
            max={LEAD_ROLE_MAX}
            auto="organization-title"
          />
        </div>
        <Fieldset
          legend={copy.contactMethod.legend}
          error={<FieldError name="contactMethod" state={shown} />}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {LEAD_CONTACT_METHODS.map((method) => (
              <label key={method} className={choiceClass}>
                <input
                  type="radio"
                  name="contactMethod"
                  value={method}
                  defaultChecked={value(state, "contactMethod", "email") === method}
                  className={choiceInputClass}
                />
                {copy.contactMethod.labels[method]}
              </label>
            ))}
          </div>
        </Fieldset>
        <TextField
          name="phone"
          label={copy.fields.phone}
          state={shown}
          type="tel"
          max={LEAD_PHONE_MAX}
          auto="tel"
        />
        <div className="grid gap-3">
          <Checkbox name="consent" label={copy.consent} state={shown} />
          <Checkbox name="newsletter" label={copy.newsletter} state={shown} />
        </div>
        <p className="text-muted-foreground text-xs">
          {copy.legal}{" "}
          <a href="/privacy" className="underline underline-offset-4 hover:text-foreground">
            {copy.privacyLink}
          </a>
          .
        </p>
        <div className="flex flex-wrap-reverse items-center justify-between gap-3 border-border border-t pt-5">
          <Button
            type="button"
            variant="ghost"
            className="step-nav min-h-11 rounded-full px-4"
            onClick={() => goTo(2)}
          >
            <Icon icon="lucide:arrow-left" aria-hidden="true" />
            {copy.stepper.back}
          </Button>
          <Button type="submit" size="lg" disabled={pending} className={primaryClass}>
            {pending ? copy.submitting : copy.submit}
          </Button>
        </div>
      </StepPanel>
    </form>
  )
}

function TextField({
  name,
  label,
  state,
  type = "text",
  max,
  auto,
  required,
}: {
  name: string
  label: string
  state: FormState
  type?: string
  max?: number
  auto?: string
  required?: boolean
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        autoComplete={auto}
        maxLength={max}
        required={required}
        className="h-11"
        defaultValue={value(state, name)}
        {...fieldAria(name, state)}
      />
      <FieldError name={name} state={state} />
    </div>
  )
}

/** A native checkbox posting `yes`, never ticked by default, with its error under it. */
function Checkbox({ name, label, state }: { name: string; label: string; state: FormState }) {
  return (
    <div className="grid gap-1">
      <label className={cn(choiceClass, "items-start")}>
        <input
          type="checkbox"
          name={name}
          value="yes"
          defaultChecked={value(state, name) === "yes"}
          className={cn(choiceInputClass, "mt-0.5")}
          {...fieldAria(name, state)}
        />
        <span>{label}</span>
      </label>
      <FieldError name={name} state={state} />
    </div>
  )
}
