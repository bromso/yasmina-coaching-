import type {
  BookingDayPart,
  BookingLocation,
  BookingStatus,
} from "@repo/api-contract/booking-limits"

/** English labels for the admin booking pages (the admin area is not translated). */
export const LOCATION_LABELS: Record<BookingLocation, string> = {
  varberg: "In person, Varberg",
  video: "Video call",
  on_site: "At the customer's site",
}

export const DAY_PART_LABELS: Record<BookingDayPart, string> = {
  morning: "morning",
  afternoon: "afternoon",
  full_day: "full day",
}

export const STATUS_VARIANTS: Record<BookingStatus, "default" | "secondary" | "destructive"> = {
  pending: "default",
  confirmed: "secondary",
  declined: "destructive",
  cancelled: "destructive",
}

export const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

/** Monday first, as the calendar grid and the availability table show them. */
export const WEEKDAYS_MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0] as const
