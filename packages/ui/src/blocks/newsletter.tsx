import { Button } from "@repo/ui/components/button"
import {
  FieldError,
  FormMessage,
  type FormState,
  fieldAria,
} from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { cn } from "@repo/ui/lib/utils"
import { type ReactNode, useId } from "react"
import { SectionHeading, type SectionHeadingProps } from "../components/section-heading"

export type NewsletterProps = {
  heading: SectionHeadingProps
  description?: string
  action: (formData: FormData) => void | Promise<void>
  state: FormState
  buttonLabel?: string
  /** The email field's (visually hidden) label and placeholder; English by default. */
  emailLabel?: string
  placeholder?: string
  legal?: ReactNode
  idPrefix?: string
  id?: string
  className?: string
}

/**
 * A signup form, not a view — the app owns the `useActionState` and passes down `action` and
 * `state`. Keeps this block a plain function the way every other block is.
 */
export function Newsletter({
  heading,
  description,
  action,
  state,
  buttonLabel = "Join the waitlist",
  emailLabel = "Email",
  placeholder = "you@example.com",
  legal,
  idPrefix = "newsletter-",
  id,
  className,
}: NewsletterProps) {
  const headingId = useId()
  const inputId = `${idPrefix}email`
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("container max-w-2xl py-20 text-center", className)}
    >
      <SectionHeading {...heading} id={headingId} />
      {description && <p className="mt-4 text-muted-foreground">{description}</p>}
      <form action={action} noValidate className="mx-auto mt-8 flex max-w-md flex-col gap-3">
        <FormMessage state={state} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1 text-left">
            <Label htmlFor={inputId} className="sr-only">
              {emailLabel}
            </Label>
            <Input
              id={inputId}
              name="email"
              type="email"
              autoComplete="email"
              placeholder={placeholder}
              required
              defaultValue={state.ok ? "" : state.values?.email}
              {...fieldAria("email", state, undefined, { idPrefix })}
            />
          </div>
          <Button type="submit">{buttonLabel}</Button>
        </div>
        <FieldError name="email" state={state} idPrefix={idPrefix} />
        {legal && <p className="text-muted-foreground text-xs">{legal}</p>}
      </form>
    </section>
  )
}
