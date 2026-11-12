import type { Migration } from "../migrate"

// Which terms a booking accepted, and when (see docs/architecture/booking.md). `terms_version` is
// `TERMS_VERSION` (`@repo/api-contract/legal`), stamped by the api, never sent by the visitor;
// `terms_accepted_at` is an ISO timestamp, TEXT like every other time on `bookings`. Both stay
// null on the rows booked before the booking form asked for consent; no rows are written here.
const bookingTerms: Migration = {
  name: "0037_booking_terms",
  async up(sql) {
    // One column per statement: SQLite's ALTER TABLE adds a single column at a time.
    await sql.unsafe("ALTER TABLE bookings ADD COLUMN terms_version TEXT")
    await sql.unsafe("ALTER TABLE bookings ADD COLUMN terms_accepted_at TEXT")
  },
}

export default bookingTerms
