"use client"

import type { Locale } from "@repo/i18n/locales"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { LocaleSwitcher } from "@repo/ui/components/locale-switcher"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { setLanguage } from "@/app/(account)/personal-info/actions"
import type { FormState } from "@/lib/actions"

const prefix = "language-"

/**
 * The Language card's form: the shared switcher, posted to `setLanguage` through
 * `useActionState`, so a refusal or the confirmation shows here rather than as a redirect. On
 * success the whole page re-renders in the new language, the confirmation included. A refusal is
 * tied to the select (`aria-invalid`, `aria-describedby`); the button is disabled while it posts.
 */
export function LanguageForm({
  current,
  options,
}: {
  current: Locale
  options: { value: string; label: string }[]
}) {
  const [state, action, pending] = useActionState(setLanguage, { ok: false } as FormState)
  return (
    <LanguageFormFields
      current={current}
      options={options}
      state={state}
      action={action}
      pending={pending}
    />
  )
}

/** The form for a given action state: what `LanguageForm` renders, testable without an action. */
export function LanguageFormFields({
  current,
  options,
  state,
  action,
  pending,
}: {
  current: Locale
  options: { value: string; label: string }[]
  state: FormState
  action: (formData: FormData) => void
  pending: boolean
}) {
  const t = useTranslations("account.language")
  return (
    <div className="grid gap-3 px-6 py-5">
      <FormMessage state={state} />
      <LocaleSwitcher
        current={current}
        options={options}
        action={action}
        label={t("label")}
        submitLabel={t("submit")}
        selectProps={fieldAria("locale", state, undefined, { idPrefix: prefix })}
        pending={pending}
      />
      <FieldError name="locale" state={state} idPrefix={prefix} />
    </div>
  )
}
