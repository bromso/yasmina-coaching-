// Its own tiny module, imported for VALUES by the "use client" unsubscribe form: `./unsubscribe`
// also pulls in `@orpc/client`, `@repo/log` and the translator for its cores, which must stay out
// of the browser bundle (the same split as `./email-change-focus`).
import type { OptionalNotificationEmailType } from "@repo/api-contract/notifications"

/** The `auth.emailUnsubscribe.types.*` key naming each optional type in a sentence. */
export const UNSUBSCRIBE_TYPE_KEYS = {
  "member.role_changed": "roleChanged",
  "member.removed": "removed",
  "plan.changed": "planChanged",
} as const satisfies Record<OptionalNotificationEmailType, string>
