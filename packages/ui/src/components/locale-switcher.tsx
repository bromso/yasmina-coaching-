"use client"

import { Button } from "@repo/ui/components/button"
import { cn } from "@repo/ui/lib/utils"
import { type ComponentProps, type ReactElement, useId, useRef } from "react"

export type LocaleSwitcherProps = {
  /** The current locale code; its option is selected. */
  current: string
  /** Every locale, each labelled in its own language (`LOCALE_NAMES` from `@repo/i18n`). */
  options: { value: string; label: string }[]
  /** Signed-in apps: a server action receiving `locale`, posted by the submit button. */
  action?: (formData: FormData) => void | Promise<void>
  /**
   * Static apps: called with the picked code when the button is pressed (no form rendered). Never
   * on the select's own `change`, which arrow keys fire on every step.
   */
  onChange?: (value: string) => void
  /** The select's accessible name. */
  label?: string
  /** The button's text. */
  submitLabel?: string
  /**
   * Passed to the `<select>`: a form that shows a field error wires it here (`fieldAria(...)` from
   * `@repo/ui/components/form-feedback`). Nothing by default.
   */
  selectProps?: Pick<ComponentProps<"select">, "aria-invalid" | "aria-describedby">
  /** A submission is in flight (`useActionState`'s `pending`): the button is disabled. */
  pending?: boolean
  className?: string
}

const selectClass =
  "h-8 rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"

/**
 * A native `<select name="locale">` of the given languages and a button that applies the pick:
 * no next-intl, all text as props. Nothing happens on the select's `change` (WCAG 3.2.2: arrow
 * keys fire it on every step), so the choice is made only by the button — with JavaScript or not.
 */
export function LocaleSwitcher({
  current,
  options,
  action,
  onChange,
  label = "Language",
  submitLabel = "Change",
  selectProps,
  pending = false,
  className,
}: LocaleSwitcherProps): ReactElement {
  const id = useId()
  const select = useRef<HTMLSelectElement>(null)

  const field = (
    <>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      {/* key: a new `current` (after the action re-renders) resets the uncontrolled select. */}
      <select
        key={current}
        ref={select}
        id={id}
        name="locale"
        defaultValue={current}
        className={selectClass}
        {...selectProps}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} lang={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  )

  if (!action) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        {field}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => {
            if (select.current) onChange?.(select.current.value)
          }}
        >
          {submitLabel}
        </Button>
      </div>
    )
  }

  return (
    <form action={action} className={cn("flex items-center gap-2", className)}>
      {field}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {submitLabel}
      </Button>
    </form>
  )
}
