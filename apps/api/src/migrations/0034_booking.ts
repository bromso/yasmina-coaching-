import { ddl } from "../dialect"
import type { Migration } from "../migrate"

// The coaching site's bookings (see docs/architecture/booking.md). Anonymous and address-keyed like
// support requests and job applications: no `user_id`. `bookings` holds every kind in one table —
// an instant session (a time picked from the calendar), a seat at a `group_events` row, or a
// request (no time until an admin confirms one, its proposals in `preferred_dates`). A package
// (`booking_packages`) groups the sessions one purchase buys. `manage_token_hash` is the SHA-256 of
// the token in the customer's manage link, shared by every row of one order so the link lists them
// all. `decided_by` is the admin who confirmed/declined/cancelled; no foreign key, like support's.
// Availability is two small tables: `booking_rules` (the weekly window, in BOOKING_TIMEZONE) and
// `booking_blocks` (whole days off, inclusive ranges). No seed rows: a migration must leave the
// database empty (a backup restores only into one), so an empty `booking_rules` means
// `DEFAULT_AVAILABILITY_RULES` (Monday–Friday 09:00–16:00) until the owner saves her own.
const booking: Migration = {
  name: "0034_booking",
  async up(sql, dialect) {
    await sql.unsafe(`
      CREATE TABLE booking_rules (
        id ${ddl.serialId(dialect)},
        weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL
      )
    `)
    await sql.unsafe(`
      CREATE TABLE booking_blocks (
        id ${ddl.serialId(dialect)},
        from_date TEXT NOT NULL,
        to_date TEXT NOT NULL,
        reason TEXT,
        created_by INTEGER,
        created_at TEXT NOT NULL
      )
    `)
    await sql.unsafe("CREATE INDEX booking_blocks_range ON booking_blocks (from_date, to_date)")
    await sql.unsafe(`
      CREATE TABLE booking_packages (
        id ${ddl.serialId(dialect)},
        offering TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        sessions_total INTEGER NOT NULL,
        manage_token_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    await sql.unsafe(`
      CREATE TABLE group_events (
        id ${ddl.serialId(dialect)},
        title TEXT NOT NULL,
        description TEXT,
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        location TEXT NOT NULL,
        capacity INTEGER NOT NULL,
        series_key TEXT,
        status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
        created_by INTEGER,
        created_at TEXT NOT NULL,
        cancelled_at TEXT
      )
    `)
    await sql.unsafe("CREATE INDEX group_events_starts_at ON group_events (status, starts_at)")
    await sql.unsafe(`
      CREATE TABLE bookings (
        id ${ddl.serialId(dialect)},
        offering TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('instant', 'group', 'request')),
        status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'declined', 'cancelled')),
        audience TEXT NOT NULL,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        organisation TEXT,
        phone TEXT,
        location TEXT NOT NULL,
        starts_at TEXT,
        ends_at TEXT,
        notes TEXT,
        preferred_dates TEXT NOT NULL DEFAULT '[]',
        attendees INTEGER,
        venue TEXT,
        package_id INTEGER,
        group_event_id INTEGER,
        manage_token_hash TEXT NOT NULL,
        ip_hash TEXT,
        locale TEXT,
        admin_note TEXT,
        decided_at TEXT,
        decided_by INTEGER,
        cancelled_at TEXT,
        created_at TEXT NOT NULL
      )
    `)
    await sql.unsafe("CREATE INDEX bookings_starts_at ON bookings (status, starts_at)")
    await sql.unsafe("CREATE INDEX bookings_token ON bookings (manage_token_hash)")
    await sql.unsafe("CREATE INDEX bookings_group_event ON bookings (group_event_id, status)")
    await sql.unsafe("CREATE INDEX bookings_package ON bookings (package_id, status)")
    await sql.unsafe("CREATE INDEX bookings_email ON bookings (lower(customer_email))")
  },
}

export default booking
