import { Alert, AlertDescription } from "@repo/ui/components/alert"

/** What a server action hands back to its form: a failure with per-field errors, or a success. */
export type FormState =
  | {
      ok: false
      message?: string
      fieldErrors?: Record<string, string>
      values?: Record<string, string>
    }
  | { ok: true; message?: string }

/**
 * Validation issues (e.g. Zod's) as one message per field; a path-less issue is keyed `form`.
 * `translate` renders an issue in the reader's language (an app maps the issue's code to its own
 * catalog); without it the issue's own `message` is shown verbatim.
 */
export function fieldErrors<I extends { path: PropertyKey[]; message: string }>(
  issues: ReadonlyArray<I>,
  translate?: (issue: I) => string
) {
  const out: Record<string, string> = {}
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form")
    if (Object.hasOwn(out, key)) continue
    out[key] = translate ? translate(issue) : issue.message
  }
  return out
}

/**
 * The polite live region is always rendered, so a success message that arrives later is announced
 * (a region mounted together with its text often is not). Empty, it is taken out of the layout flow
 * so it adds no grid gap. An error is a separate destructive alert, rendered only when there is one.
 */
export function FormMessage({ state }: { state: FormState }) {
  // A path-less validation issue lands under `fieldErrors.form`; show it rather than drop it.
  const error = state.ok ? undefined : (state.message ?? state.fieldErrors?.form)
  const success = state.ok ? state.message : undefined
  return (
    <>
      <div role="status" aria-live="polite" className="empty:absolute">
        {success && (
          <Alert role="none">
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}
      </div>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </>
  )
}

/**
 * `idPrefix` disambiguates two independent forms that share a field name on the same page (e.g.
 * two "email" fields with separate `useActionState`s) — it must match between `FieldError` and
 * `fieldAria` for the same field, and otherwise defaults to nothing so existing callers are unaffected.
 */
export function FieldError({
  name,
  state,
  idPrefix = "",
}: {
  name: string
  state: FormState
  idPrefix?: string
}) {
  const message = state.ok ? undefined : state.fieldErrors?.[name]
  if (!message) return null
  return (
    <p id={`${idPrefix}${name}-error`} className="text-destructive text-sm">
      {message}
    </p>
  )
}

/**
 * `aria-invalid` / `aria-describedby` for an input whose error `FieldError` renders. `describedBy`
 * (e.g. a hint's id) stays linked whether or not the field is invalid. `idPrefix` for a second form
 * on the same page — see `FieldError`.
 */
export function fieldAria(
  name: string,
  state: FormState,
  describedBy?: string,
  options?: { idPrefix?: string }
) {
  const invalid = !state.ok && Boolean(state.fieldErrors?.[name])
  const errorId = invalid ? `${options?.idPrefix ?? ""}${name}-error` : undefined
  return {
    "aria-invalid": invalid ? (true as const) : undefined,
    "aria-describedby": [describedBy, errorId].filter(Boolean).join(" ") || undefined,
  }
}
