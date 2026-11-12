import type { Migration } from "../migrate"

// When a private client asked for their session to start within the 14-day withdrawal period
// (lag (2005:59) 2 kap. 11 § 1; see docs/architecture/booking.md). An ISO timestamp, TEXT like
// `terms_accepted_at`, stamped by the api only when the booking needed the consent and the visitor
// gave it; null otherwise, and on every row booked before the form asked. No rows are written here.
const bookingEarlyStart: Migration = {
  name: "0038_booking_early_start",
  async up(sql) {
    await sql.unsafe("ALTER TABLE bookings ADD COLUMN early_start_requested_at TEXT")
  },
}

export default bookingEarlyStart
