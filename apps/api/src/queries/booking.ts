import {
  type BookingAudience,
  type BookingLocation,
  type BookingStatus,
  DEFAULT_AVAILABILITY_RULES,
  type OfferingKey,
  type OfferingKind,
} from "@repo/api-contract"
import type { SQL } from "bun"
import { dialectOf } from "../dialect"

export type BookingRuleRow = { id: number; weekday: number; start_time: string; end_time: string }
export type BookingBlockRow = {
  id: number
  from_date: string
  to_date: string
  reason: string | null
  created_by: number | null
  created_at: string
}
export type BookingPackageRow = {
  id: number
  offering: OfferingKey
  customer_email: string
  sessions_total: number
  manage_token_hash: string
  created_at: string
}
export type GroupEventRow = {
  id: number
  title: string
  description: string | null
  offering: OfferingKey
  starts_at: string
  ends_at: string
  location: BookingLocation
  capacity: number
  series_key: string | null
  status: "scheduled" | "cancelled"
  created_by: number | null
  created_at: string
  cancelled_at: string | null
}
/** A group event plus its confirmed seat count. */
export type GroupEventWithSeats = GroupEventRow & { seats_taken: number }
export type BookingRow = {
  id: number
  offering: OfferingKey
  kind: OfferingKind
  status: BookingStatus
  audience: BookingAudience
  customer_name: string
  customer_email: string
  organisation: string | null
  phone: string | null
  location: BookingLocation
  starts_at: string | null
  ends_at: string | null
  notes: string | null
  /** JSON: `PreferredDate[]`. */
  preferred_dates: string
  attendees: number | null
  venue: string | null
  package_id: number | null
  group_event_id: number | null
  manage_token_hash: string
  ip_hash: string | null
  locale: string | null
  admin_note: string | null
  decided_at: string | null
  decided_by: number | null
  cancelled_at: string | null
  created_at: string
  /** The `TERMS_VERSION` accepted when booking; null on rows from before consent was asked. */
  terms_version: string | null
  terms_accepted_at: string | null
  /** When a private client asked to start within the withdrawal period; null when not needed. */
  early_start_requested_at: string | null
}
/** What `privacy.export` lists for an address: never the hashes, the ip or the admin's note. */
export type ExportedBookingRow = Pick<
  BookingRow,
  | "id"
  | "offering"
  | "kind"
  | "status"
  | "audience"
  | "customer_name"
  | "customer_email"
  | "organisation"
  | "phone"
  | "location"
  | "starts_at"
  | "ends_at"
  | "notes"
  | "preferred_dates"
  | "attendees"
  | "venue"
  | "created_at"
  | "cancelled_at"
  | "terms_version"
  | "terms_accepted_at"
  | "early_start_requested_at"
>

/** A booking plus its group event's title and the deciding admin's email, for the admin pages. */
export type AdminBookingRow = BookingRow & {
  group_event_title: string | null
  decided_by_email: string | null
}

const num = (v: number | string | null) => (v === null ? null : Number(v))
const toBooking = <T extends BookingRow>(row: T): T => ({
  ...row,
  id: Number(row.id),
  attendees: num(row.attendees),
  package_id: num(row.package_id),
  group_event_id: num(row.group_event_id),
  decided_by: num(row.decided_by),
})
const toEvent = <T extends GroupEventRow>(row: T): T => ({
  ...row,
  id: Number(row.id),
  capacity: Number(row.capacity),
  created_by: num(row.created_by),
  ...("seats_taken" in row
    ? { seats_taken: Number((row as GroupEventWithSeats).seats_taken) }
    : {}),
})

const ADMIN_SELECT = (sql: SQL) => sql`
  SELECT b.*, e.title AS group_event_title, u.email AS decided_by_email
  FROM bookings b
  LEFT JOIN group_events e ON e.id = b.group_event_id
  LEFT JOIN users u ON u.id = b.decided_by
`

/** The coaching site's bookings (migration 0034). */
export function bookingQueries(sql: SQL) {
  return {
    rules: {
      /** The stored rules; empty until the owner saves some (callers fall back to the defaults). */
      async list(): Promise<BookingRuleRow[]> {
        const rows: BookingRuleRow[] =
          await sql`SELECT * FROM booking_rules ORDER BY weekday, start_time`
        return rows.map((r) => ({ ...r, id: Number(r.id), weekday: Number(r.weekday) }))
      },
      /** The rules the engine runs on: the stored ones, or `DEFAULT_AVAILABILITY_RULES`. */
      async effective(): Promise<Array<{ weekday: number; start: string; end: string }>> {
        const rows: BookingRuleRow[] =
          await sql`SELECT * FROM booking_rules ORDER BY weekday, start_time`
        if (rows.length === 0) return [...DEFAULT_AVAILABILITY_RULES]
        return rows.map((r) => ({
          weekday: Number(r.weekday),
          start: r.start_time,
          end: r.end_time,
        }))
      },
      /** Replaces every rule. Runs inside the caller's transaction. */
      async replace(rules: Array<{ weekday: number; start: string; end: string }>): Promise<void> {
        await sql`DELETE FROM booking_rules`
        for (const rule of rules) {
          await sql`INSERT INTO booking_rules (weekday, start_time, end_time)
            VALUES (${rule.weekday}, ${rule.start}, ${rule.end})`
        }
      },
      /**
       * The calendar's mutex: `booking.book`, `admin.bookings.confirm` and `groupEvents.create`
       * take it before checking for overlaps, so two writers in flight serialise. On Postgres a
       * transaction-scoped advisory lock (released at commit); on SQLite the repo already runs
       * every writing transaction exclusively, so there is nothing to take.
       */
      async lock(): Promise<void> {
        if (dialectOf(sql) === "postgres") await sql`SELECT pg_advisory_xact_lock(727001)`
      },
    },

    blocks: {
      async list(): Promise<BookingBlockRow[]> {
        const rows: BookingBlockRow[] = await sql`SELECT * FROM booking_blocks ORDER BY from_date`
        return rows.map((r) => ({ ...r, id: Number(r.id), created_by: num(r.created_by) }))
      },
      /** Blocks touching any day from `from` through `to`. */
      async inRange(from: string, to: string): Promise<BookingBlockRow[]> {
        const rows: BookingBlockRow[] = await sql`
          SELECT * FROM booking_blocks WHERE from_date <= ${to} AND to_date >= ${from}
          ORDER BY from_date`
        return rows.map((r) => ({ ...r, id: Number(r.id), created_by: num(r.created_by) }))
      },
      async add(input: {
        from: string
        to: string
        reason: string | null
        createdBy: number
        createdAt: string
      }): Promise<{ id: number }> {
        const [row]: Array<{ id: number }> = await sql`
          INSERT INTO booking_blocks (from_date, to_date, reason, created_by, created_at)
          VALUES (${input.from}, ${input.to}, ${input.reason}, ${input.createdBy}, ${input.createdAt})
          RETURNING id`
        if (!row) throw new Error("INSERT … RETURNING produced no row")
        return { id: Number(row.id) }
      },
      async remove(id: number): Promise<boolean> {
        const rows: Array<{ id: number }> =
          await sql`DELETE FROM booking_blocks WHERE id = ${id} RETURNING id`
        return rows.length > 0
      },
    },

    /**
     * Every interval the calendar must keep clear between two instants: confirmed bookings with a
     * time (sessions, seats are covered by their event) and scheduled group events.
     */
    async busy(
      fromIso: string,
      toIso: string
    ): Promise<Array<{ startsAt: string; endsAt: string }>> {
      const bookings: Array<{ starts_at: string; ends_at: string }> = await sql`
        SELECT starts_at, ends_at FROM bookings
        WHERE status = 'confirmed' AND group_event_id IS NULL AND starts_at IS NOT NULL
          AND starts_at < ${toIso} AND ends_at > ${fromIso}`
      const events: Array<{ starts_at: string; ends_at: string }> = await sql`
        SELECT starts_at, ends_at FROM group_events
        WHERE status = 'scheduled' AND starts_at < ${toIso} AND ends_at > ${fromIso}`
      return [...bookings, ...events].map((r) => ({ startsAt: r.starts_at, endsAt: r.ends_at }))
    },

    packages: {
      async create(input: {
        offering: OfferingKey
        customerEmail: string
        sessionsTotal: number
        manageTokenHash: string
        createdAt: string
      }): Promise<{ id: number }> {
        const [row]: Array<{ id: number }> = await sql`
          INSERT INTO booking_packages
            (offering, customer_email, sessions_total, manage_token_hash, created_at)
          VALUES (${input.offering}, ${input.customerEmail}, ${input.sessionsTotal},
            ${input.manageTokenHash}, ${input.createdAt})
          RETURNING id`
        if (!row) throw new Error("INSERT … RETURNING produced no row")
        return { id: Number(row.id) }
      },
      async find(id: number): Promise<BookingPackageRow | undefined> {
        const [row]: BookingPackageRow[] =
          await sql`SELECT * FROM booking_packages WHERE id = ${id}`
        return row && { ...row, id: Number(row.id), sessions_total: Number(row.sessions_total) }
      },
      async byToken(hash: string): Promise<BookingPackageRow | undefined> {
        const [row]: BookingPackageRow[] =
          await sql`SELECT * FROM booking_packages WHERE manage_token_hash = ${hash}`
        return row && { ...row, id: Number(row.id), sessions_total: Number(row.sessions_total) }
      },
      /** Sessions placed on the calendar for the package: confirmed ones, past or future. */
      async sessionsBooked(id: number): Promise<number> {
        const [row]: Array<{ n: number }> = await sql`
          SELECT COUNT(*) AS n FROM bookings WHERE package_id = ${id} AND status = 'confirmed'`
        return Number(row?.n ?? 0)
      },
    },

    events: {
      async create(input: {
        title: string
        description: string | null
        offering: OfferingKey
        startsAt: string
        endsAt: string
        location: BookingLocation
        capacity: number
        seriesKey: string | null
        createdBy: number
        createdAt: string
      }): Promise<{ id: number }> {
        const [row]: Array<{ id: number }> = await sql`
          INSERT INTO group_events
            (title, description, offering, starts_at, ends_at, location, capacity, series_key,
              status, created_by, created_at)
          VALUES (${input.title}, ${input.description}, ${input.offering}, ${input.startsAt},
            ${input.endsAt},
            ${input.location}, ${input.capacity}, ${input.seriesKey}, 'scheduled',
            ${input.createdBy}, ${input.createdAt})
          RETURNING id`
        if (!row) throw new Error("INSERT … RETURNING produced no row")
        return { id: Number(row.id) }
      },
      async find(id: number): Promise<GroupEventWithSeats | undefined> {
        const [row]: GroupEventWithSeats[] = await sql`
          SELECT e.*, (SELECT COUNT(*) FROM bookings b
            WHERE b.group_event_id = e.id AND b.status = 'confirmed') AS seats_taken
          FROM group_events e WHERE e.id = ${id}`
        return row && toEvent(row)
      },
      /** Takes a write lock on the event row before seats are counted and taken. */
      async lock(id: number): Promise<boolean> {
        const rows: Array<{ id: number }> =
          await sql`UPDATE group_events SET title = title WHERE id = ${id} RETURNING id`
        return rows.length > 0
      },
      /** One offering's scheduled events starting after `nowIso`, soonest first. */
      async upcoming(nowIso: string, offering: OfferingKey): Promise<GroupEventWithSeats[]> {
        const rows: GroupEventWithSeats[] = await sql`
          SELECT e.*, (SELECT COUNT(*) FROM bookings b
            WHERE b.group_event_id = e.id AND b.status = 'confirmed') AS seats_taken
          FROM group_events e
          WHERE e.status = 'scheduled' AND e.offering = ${offering} AND e.starts_at > ${nowIso}
          ORDER BY e.starts_at`
        return rows.map(toEvent)
      },
      /** Every event (any status) starting between the two instants, for the admin calendar. */
      async inRange(fromIso: string, toIso: string): Promise<GroupEventWithSeats[]> {
        const rows: GroupEventWithSeats[] = await sql`
          SELECT e.*, (SELECT COUNT(*) FROM bookings b
            WHERE b.group_event_id = e.id AND b.status = 'confirmed') AS seats_taken
          FROM group_events e
          WHERE e.starts_at >= ${fromIso} AND e.starts_at < ${toIso}
          ORDER BY e.starts_at`
        return rows.map(toEvent)
      },
      /** scheduled → cancelled; false when it already was. */
      async cancel(id: number, at: string): Promise<boolean> {
        const rows: Array<{ id: number }> = await sql`
          UPDATE group_events SET status = 'cancelled', cancelled_at = ${at}
          WHERE id = ${id} AND status = 'scheduled' RETURNING id`
        return rows.length > 0
      },
    },

    async create(input: {
      offering: OfferingKey
      kind: OfferingKind
      status: BookingStatus
      audience: BookingAudience
      customerName: string
      customerEmail: string
      organisation: string | null
      phone: string | null
      location: BookingLocation
      startsAt: string | null
      endsAt: string | null
      notes: string | null
      preferredDates: string
      attendees: number | null
      venue: string | null
      packageId: number | null
      groupEventId: number | null
      manageTokenHash: string
      ipHash: string | null
      locale: string | null
      createdAt: string
      /** `TERMS_VERSION`, stamped by the handler; never a value the visitor sent. */
      termsVersion: string
      termsAcceptedAt: string
      /** When the visitor asked to start within the withdrawal period; null unless it was needed. */
      earlyStartRequestedAt: string | null
    }): Promise<{ id: number }> {
      const [row]: Array<{ id: number }> = await sql`
        INSERT INTO bookings
          (offering, kind, status, audience, customer_name, customer_email, organisation, phone,
            location, starts_at, ends_at, notes, preferred_dates, attendees, venue, package_id,
            group_event_id, manage_token_hash, ip_hash, locale, created_at, terms_version,
            terms_accepted_at, early_start_requested_at)
        VALUES (${input.offering}, ${input.kind}, ${input.status}, ${input.audience},
          ${input.customerName}, ${input.customerEmail}, ${input.organisation}, ${input.phone},
          ${input.location}, ${input.startsAt}, ${input.endsAt}, ${input.notes},
          ${input.preferredDates}, ${input.attendees}, ${input.venue}, ${input.packageId},
          ${input.groupEventId}, ${input.manageTokenHash}, ${input.ipHash}, ${input.locale},
          ${input.createdAt}, ${input.termsVersion}, ${input.termsAcceptedAt},
          ${input.earlyStartRequestedAt})
        RETURNING id`
      if (!row) throw new Error("INSERT … RETURNING produced no row")
      return { id: Number(row.id) }
    },

    async find(id: number): Promise<AdminBookingRow | undefined> {
      const [row]: AdminBookingRow[] = await sql`${ADMIN_SELECT(sql)} WHERE b.id = ${id}`
      return row && toBooking(row)
    },

    /** Every booking behind one manage link, oldest first. */
    async byToken(hash: string): Promise<AdminBookingRow[]> {
      const rows: AdminBookingRow[] =
        await sql`${ADMIN_SELECT(sql)} WHERE b.manage_token_hash = ${hash} ORDER BY b.starts_at, b.id`
      return rows.map(toBooking)
    },

    /** Bookings with a time inside the range, every status, for the admin calendar. */
    async inRange(fromIso: string, toIso: string): Promise<AdminBookingRow[]> {
      const rows: AdminBookingRow[] = await sql`
        ${ADMIN_SELECT(sql)}
        WHERE b.starts_at IS NOT NULL AND b.starts_at >= ${fromIso} AND b.starts_at < ${toIso}
        ORDER BY b.starts_at, b.id`
      return rows.map(toBooking)
    },

    /** Requests still waiting for a decision, oldest first. */
    async pending(): Promise<AdminBookingRow[]> {
      const rows: AdminBookingRow[] =
        await sql`${ADMIN_SELECT(sql)} WHERE b.status = 'pending' ORDER BY b.id`
      return rows.map(toBooking)
    },

    /** Confirmed seat holders of an event (for a cancellation's mails). */
    async seatHolders(eventId: number): Promise<AdminBookingRow[]> {
      const rows: AdminBookingRow[] = await sql`
        ${ADMIN_SELECT(sql)} WHERE b.group_event_id = ${eventId} AND b.status = 'confirmed'
        ORDER BY b.id`
      return rows.map(toBooking)
    },

    /** Replaces the manage token's hash (a confirmed request gets a fresh link). */
    async rotateToken(id: number, hash: string): Promise<void> {
      await sql`UPDATE bookings SET manage_token_hash = ${hash} WHERE id = ${id}`
    },

    /** pending → confirmed at a time; false when it was no longer pending. */
    async confirm(input: {
      id: number
      startsAt: string
      endsAt: string
      location: BookingLocation
      adminNote: string | null
      decidedBy: number
      decidedAt: string
    }): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        UPDATE bookings SET status = 'confirmed', starts_at = ${input.startsAt},
          ends_at = ${input.endsAt}, location = ${input.location}, admin_note = ${input.adminNote},
          decided_by = ${input.decidedBy}, decided_at = ${input.decidedAt}
        WHERE id = ${input.id} AND status = 'pending' RETURNING id`
      return rows.length > 0
    },

    /** pending → declined; false when it was no longer pending. */
    async decline(input: {
      id: number
      adminNote: string | null
      decidedBy: number
      decidedAt: string
    }): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        UPDATE bookings SET status = 'declined', admin_note = ${input.adminNote},
          decided_by = ${input.decidedBy}, decided_at = ${input.decidedAt}
        WHERE id = ${input.id} AND status = 'pending' RETURNING id`
      return rows.length > 0
    },

    /**
     * confirmed (or pending) → cancelled; false when it already was decided otherwise. `by` is the
     * admin, or null when the customer cancelled from the manage link.
     */
    async cancel(input: {
      id: number
      adminNote: string | null
      by: number | null
      at: string
    }): Promise<boolean> {
      const rows: Array<{ id: number }> = await sql`
        UPDATE bookings SET status = 'cancelled', cancelled_at = ${input.at},
          admin_note = COALESCE(${input.adminNote}, admin_note),
          decided_by = COALESCE(${input.by}, decided_by), decided_at = ${input.at}
        WHERE id = ${input.id} AND status IN ('confirmed', 'pending') RETURNING id`
      return rows.length > 0
    },

    /** Bookings for an address (for the privacy export): an explicit column list, never the hashes. */
    async forEmail(email: string): Promise<ExportedBookingRow[]> {
      const rows: ExportedBookingRow[] = await sql`
        SELECT id, offering, kind, status, audience, customer_name, customer_email, organisation,
          phone, location, starts_at, ends_at, notes, preferred_dates, attendees, venue,
          created_at, cancelled_at, terms_version, terms_accepted_at, early_start_requested_at
        FROM bookings WHERE lower(customer_email) = lower(${email}) ORDER BY id`
      return rows.map((r) => ({ ...r, id: Number(r.id), attendees: num(r.attendees) }))
    },
  }
}
