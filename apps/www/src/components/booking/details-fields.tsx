import type { BookingAudience, BookingLocation } from "@repo/api-contract/booking-limits"
import { FieldError, type FormState, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import { useBookingCopy } from "@/components/booking/locale-provider"
import { cn } from "@/lib/utils"

/*
 * The fields every booking form shares: who is booking, where, and a note. Plain inputs and
 * native radios, so each form posts without JavaScript; the parents (client components) own
 * the `useActionState` and pass `state` down for errors and repopulation. Rendered only inside
 * those client forms, so they read their labels with `useBookingCopy()` (the page's language).
 */

export const value = (state: FormState, name: string, fallback = ""): string =>
  state.ok ? fallback : (state.values?.[name] ?? fallback)

/** A native radio or checkbox row with a 44 px target, the site's rounded card look. */
export const choiceClass =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-border bg-background/70 px-4 py-2.5 text-sm transition-[border-color,background-color,transform] duration-200 ease-out has-[:checked]:border-foreground has-[:checked]:bg-background has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 motion-safe:active:scale-[0.99]"
export const choiceInputClass =
  "size-4 shrink-0 accent-primary transition-transform duration-200 ease-out motion-safe:checked:scale-110"

export function Fieldset({
  legend,
  hint,
  error,
  children,
  className,
}: {
  legend: string
  hint?: string
  error?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <fieldset className={cn("grid gap-3", className)}>
      <legend className="font-medium text-sm">{legend}</legend>
      {hint && <p className="-mt-1 text-muted-foreground text-sm">{hint}</p>}
      {children}
      {error}
    </fieldset>
  )
}

type AudienceFieldProps = {
  audiences: readonly BookingAudience[]
  audience: BookingAudience
  onChange: (audience: BookingAudience) => void
  state: FormState
}

/** "Booking as": a radio pair when the offering takes both audiences, a hidden field otherwise. */
export function AudienceField({ audiences, audience, onChange, state }: AudienceFieldProps) {
  const copy = useBookingCopy()
  if (audiences.length < 2) {
    return <input type="hidden" name="audience" value={audiences[0] ?? audience} />
  }
  return (
    <Fieldset
      legend={copy.details.audienceLegend}
      error={<FieldError name="audience" state={state} />}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {audiences.map((option) => (
          <label key={option} className={choiceClass}>
            <input
              type="radio"
              name="audience"
              value={option}
              checked={audience === option}
              onChange={() => onChange(option)}
              className={choiceInputClass}
            />
            <span className="grid">
              <span className="font-medium">{copy.audienceLabels[option]}</span>
              <span className="text-muted-foreground text-xs">{copy.audienceHints[option]}</span>
            </span>
          </label>
        ))}
      </div>
    </Fieldset>
  )
}

type CustomerFieldsProps = {
  state: FormState
  /** Shows the organisation field; `required` makes it mandatory (every request kind). */
  organisation: "hidden" | "optional" | "required"
}

export function CustomerFields({ state, organisation }: CustomerFieldsProps) {
  const { fields } = useBookingCopy()
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor="name">{fields.name}</Label>
        <Input
          id="name"
          name="name"
          autoComplete="name"
          required
          className="h-11"
          defaultValue={value(state, "name")}
          {...fieldAria("name", state)}
        />
        <FieldError name="name" state={state} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">{fields.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-11"
          defaultValue={value(state, "email")}
          {...fieldAria("email", state)}
        />
        <FieldError name="email" state={state} />
      </div>
      {organisation !== "hidden" && (
        <div className="grid gap-2">
          <Label htmlFor="organisation">
            {organisation === "required" ? fields.organisation : fields.organisationOptional}
          </Label>
          <Input
            id="organisation"
            name="organisation"
            autoComplete="organization"
            required={organisation === "required"}
            className="h-11"
            defaultValue={value(state, "organisation")}
            {...fieldAria("organisation", state)}
          />
          <FieldError name="organisation" state={state} />
        </div>
      )}
      <div className="grid gap-2">
        <Label htmlFor="phone">{fields.phoneOptional}</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          className="h-11"
          defaultValue={value(state, "phone")}
          {...fieldAria("phone", state)}
        />
        <FieldError name="phone" state={state} />
      </div>
    </>
  )
}

type LocationFieldProps = {
  locations: readonly BookingLocation[]
  state: FormState
}

/** "Where": native radios over the offering's own locations, the first one preselected. */
export function LocationField({ locations, state }: LocationFieldProps) {
  const copy = useBookingCopy()
  const selected = value(state, "location", locations[0] ?? "")
  return (
    <Fieldset
      legend={copy.details.locationLegend}
      error={<FieldError name="location" state={state} />}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {locations.map((location) => (
          <label key={location} className={choiceClass}>
            <input
              type="radio"
              name="location"
              value={location}
              defaultChecked={selected === location}
              className={choiceInputClass}
            />
            {copy.locationLabels[location]}
          </label>
        ))}
      </div>
    </Fieldset>
  )
}

export function NotesField({ state, label }: { state: FormState; label?: string }) {
  const copy = useBookingCopy()
  return (
    <div className="grid gap-2">
      <Label htmlFor="notes">{label ?? copy.details.notesLabel}</Label>
      <Textarea
        id="notes"
        name="notes"
        rows={4}
        defaultValue={value(state, "notes")}
        {...fieldAria("notes", state)}
      />
      <FieldError name="notes" state={state} />
    </div>
  )
}
