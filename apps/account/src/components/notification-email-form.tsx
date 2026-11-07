"use client"

import {
  NOTIFICATION_EMAIL,
  NOTIFICATION_EMAIL_DEFAULT,
  type OptionalNotificationEmailType,
} from "@repo/api-contract/notifications"
import { Button } from "@repo/ui/components/button"
import { FormMessage, type FormState } from "@repo/ui/components/form-feedback"
import { Label } from "@repo/ui/components/label"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { saveNotificationEmailSettings } from "@/app/(account)/notifications/actions"

const initial: FormState = { ok: false }

function idFor(type: OptionalNotificationEmailType) {
  return `notification-email-${type.replace(/[._]/g, "-")}`
}

/** Each optional type's checkbox label, in the page's language. Mirrors `webhooks-card`'s
 * `eventLabel`: a switch over the raw value, so a type `NOTIFICATION_EMAIL.optional` gains
 * without its own case here fails the typecheck instead of rendering nothing. */
function typeLabel(
  t: ReturnType<typeof useTranslations<"account.notifications">>,
  type: OptionalNotificationEmailType
): string {
  switch (type) {
    case "member.role_changed":
      return t("email.types.roleChanged")
    case "member.removed":
      return t("email.types.removed")
    case "plan.changed":
      return t("email.types.planChanged")
    default: {
      const unhandled: never = type
      return unhandled
    }
  }
}

/**
 * The Email section's checkboxes and **Save email settings** button: one checkbox per optional
 * notification type, none of it needing JavaScript — a hidden `type` field per type (so a missing
 * checkbox always reads as unchecked, never as "not on this form") and a hidden `wasEmail` for
 * whichever were on when the page rendered, so `setNotificationEmailCore` sends only the types
 * that changed. While impersonating every control is disabled and the save button is replaced
 * by the page's existing impersonation note, like the list above it.
 */
export function NotificationEmailForm({
  preferences,
  impersonating,
}: {
  /** The optional types only, in `NOTIFICATION_EMAIL.optional` order. */
  preferences: readonly { type: OptionalNotificationEmailType; email: boolean }[]
  impersonating: boolean
}) {
  const [state, action, pending] = useActionState(saveNotificationEmailSettings, initial)
  const t = useTranslations("account.notifications")
  const emailByType = new Map(preferences.map((row) => [row.type, row.email]))
  return (
    <form action={action} className="flex flex-col gap-4">
      <FormMessage state={state} />
      <fieldset className="grid gap-3" disabled={impersonating}>
        <legend className="sr-only">{t("email.legend")}</legend>
        {NOTIFICATION_EMAIL.optional.map((type) => {
          const checked = emailByType.get(type) ?? NOTIFICATION_EMAIL_DEFAULT
          const id = idFor(type)
          return (
            <div key={type} className="flex items-center gap-2">
              <input type="hidden" name="type" value={type} />
              {checked && <input type="hidden" name="wasEmail" value={type} />}
              {/* Native, not the Radix Checkbox: that one submits its value only once hydrated. */}
              <input
                type="checkbox"
                id={id}
                name="email"
                value={type}
                defaultChecked={checked}
                disabled={impersonating}
                className="size-4 accent-primary"
              />
              <Label htmlFor={id} className="text-sm font-normal">
                {typeLabel(t, type)}
              </Label>
            </div>
          )
        })}
      </fieldset>
      {impersonating ? (
        <p className="text-muted-foreground text-sm">{t("impersonating")}</p>
      ) : (
        <div>
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            {t("email.save")}
          </Button>
        </div>
      )}
    </form>
  )
}
