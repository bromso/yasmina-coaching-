import {
  MEMBER_OFFERING_KEYS,
  OFFERINGS,
  type OfferingKey,
} from "@repo/api-contract/booking-limits"

/**
 * Which journey a booking takes, and so which steps its stepper shows (`steps` in
 * `src/content/booking-forms.ts`): `instant` and `group` pick, give details, pay, done; `request`
 * describes, gives details, reviews, done; `member` (a members' session, or an extra session on a
 * programme) picks, gives details, done, with nothing to pay. Client-safe.
 */
export const BOOKING_FLOWS = ["instant", "group", "request", "member"] as const
export type BookingFlow = (typeof BOOKING_FLOWS)[number]

const members: readonly OfferingKey[] = MEMBER_OFFERING_KEYS

/**
 * The journey of `offering`; `extending` (a further session on a programme, its manage token
 * verified by the server) is a member's one.
 */
export function flowFor(offering: OfferingKey, extending = false): BookingFlow {
  if (members.includes(offering) || extending) return "member"
  return OFFERINGS[offering].kind
}

/** Whether a journey has a payment step. */
export const paysIn = (flow: BookingFlow): boolean => flow === "instant" || flow === "group"

/** `/book/done`'s `?kind=`, from the query string: one of the four, `instant` otherwise. */
export const parseFlow = (raw: unknown): BookingFlow =>
  typeof raw === "string" && (BOOKING_FLOWS as readonly string[]).includes(raw)
    ? (raw as BookingFlow)
    : "instant"
