# Booking

The coaching site's calendar: how a visitor books a session, a programme, seats at a group event,
or requests a workshop, an enterprise programme or a keynote, and how Yasmina runs it from the
admin area. The summary in `CLAUDE.md` (**Booking.**) is the short form; this is the full
behaviour.

## Offerings

The catalog lives in `packages/api-contract/src/booking-limits.ts` (`OFFERINGS`, Zod-free so the
browser can import it through `@repo/api-contract/booking-limits`). Each offering has a `kind`:

| Kind | Offerings | How it is booked |
|---|---|---|
| `instant` | `session`, `package_6`, `package_10`, `inner_start_coaching`, `inner_start_mentoring`, `inner_start_lifestyle`, `inner_session`, `inner_mentoring_session` | Pick free slots on the calendar; confirmed at once. A package books one or more sessions now; the rest are placed later from the manage link. |
| `group` | `group`, `inner_group` | Reserve seats at a `group_events` row Yasmina scheduled, one date or several of a weekly series. |
| `request` | `workshop`, `enterprise`, `keynote` | Propose up to three dates (morning / afternoon / full day), attendees, venue and a message; Yasmina confirms a time from `/admin/bookings`. Every request kind is B2B: an organisation is required. |

The `inner_*` keys belong to the Ledarskap inifrån track (`apps/www`'s `/inifran`). The three
`inner_start_*` keys are the 90-minute start calls and `inner_group` is the Inifrån group.
`inner_session` and `inner_mentoring_session` are the members' sessions: `MEMBER_OFFERING_KEYS`
hides them from `/book` and the site nav, but `/book/<key>` still works for anyone holding the link
(they are in `OFFERINGS`, so the contract accepts them). The inner offerings show a fixed price on
`/book` and their service pages (`apps/www/src/content/inner-pricing.ts`) instead of the written
quote; the system itself still stores no prices.

Audiences (`private`, `organisation`) and locations (`varberg`, `video`, `on_site`) are per
offering; the contract refuses a combination the catalog does not list. Prices are not in the
system: the site says a quote is confirmed in writing before the first session.

## Availability

`booking_rules` holds the weekly window per weekday (`HH:MM`–`HH:MM` in `BOOKING_TIMEZONE`,
`Europe/Stockholm`). The table starts empty (a migration must leave the database empty, so a backup can restore into it); while it is, the engine and `admin.bookings.availability.get` use `DEFAULT_AVAILABILITY_RULES`, Monday–Friday 09:00–16:00. `booking_blocks` holds whole
days off (inclusive date ranges). The engine (`apps/api/src/booking/availability.ts`, pure, tested
across a DST boundary) offers a slot when it starts on the 30-minute grid inside a rule, ends inside
it, starts at least `BOOKING_LEAD_HOURS` (24) after now, lies within `BOOKING_HORIZON_DAYS` (90), its
day is not blocked, and it keeps `BOOKING_BUFFER_MINUTES` (15) clear of every busy interval:
confirmed bookings with a time and scheduled group events. Storage is UTC ISO; only the rules and
the day strings are zoned (`date-fns-tz`).

`booking.availability` returns per-day slot lists for an instant offering (≤ 62 days per call).
`booking.book` never trusts a slot the visitor sends: inside its transaction it takes the calendar
lock (`booking.rules.lock`: a transaction-scoped Postgres advisory lock so concurrent bookers
serialise; SQLite transactions are exclusive anyway), re-derives the day's slots and refuses with `CONFLICT`
(`bookingSlotTaken`) when any slot is no longer offered. Slots of the same order are checked
against each other too.

## Bookings

One table, `bookings`, for every kind: `kind`, `status` (`pending` → `confirmed` | `declined`;
`confirmed` → `cancelled`), the customer (name, email, organisation, phone), `location`,
`starts_at`/`ends_at` (null for a pending request), `notes` (the customer's message),
`preferred_dates` (JSON, requests), `attendees`, `venue`, `package_id`, `group_event_id`, the
`manage_token_hash`, `ip_hash`, the customer's `locale` (so a later admin mail speaks their
language), and the decision (`admin_note`, `decided_by`, `decided_at`, `cancelled_at`). References
are `BK-<id>`; group events are `GE-<id>`.

Writes are anonymous (service token only) and run the three limiters first, like support: per
client (`booking:<ip hash>`, 10/hour), per typed address (`booking-to:<email>`, 5/day), api-wide
(200/hour), each refusing with the translated `bookingRate`. The row and both mails commit together:
the customer's (`bookingConfirmed` or `bookingRequestReceived`, in `x-locale`'s language, Reply-To
`BOOKING_EMAIL`) and Yasmina's (`bookingNew`, English, Reply-To the customer, linking
`/admin/bookings/<id>`). `BOOKING_EMAIL` falls back to where support requests go.

### Consent to the terms

Every booking form on `/book` (instant, group and request) has a required checkbox, `terms`
(posted as `on`), labelled "Jag har läst villkoren och integritetspolicyn" / "I have read the
terms and the privacy policy", each part linking the legal app's page in the form's language
(`legalUrl`, computed in the server view and passed down as strings). The www cores refuse an
unticked box with their own message and never call the api; otherwise they send
`termsAccepted: true`, which `BookingCreateSchema`, `BookingReserveSchema` and
`BookingRequestSchema` require (`z.literal(true)`). The api never takes a version from the client:
each handler stamps `terms_version = TERMS_VERSION` (`@repo/api-contract/legal`, the terms page's
newest change date) and `terms_accepted_at = now` on every row it inserts (migration
`0037_booking_terms`; rows from before stay null). When the terms page gets a new change-log
entry, `TERMS_VERSION` must move with it: `apps/legal/src/lib/terms-version.test.ts` fails until
it does. `bookingConfirmed` and `bookingRequestReceived` link the terms (`termsUrl`); a private
client's confirmation (`withdrawal`, `audience === "private"`) adds the line on the 14-day right of
withdrawal. Requests are organisation-only, so theirs never does.

### Manage links

Every order gets a 256-bit token; its SHA-256 is stored on each booking (and the package). The
confirmation mail and the response carry `<www>/book/manage/<token>`. `booking.manage.get` lists the
order's bookings and package (reads are throttled per client only), `booking.manage.cancel` cancels
one booking until `BOOKING_CANCEL_CUTOFF_HOURS` (24) before it starts (`CONFLICT` with
`bookingCancelLate` after that), mailing the customer (`bookingCancelled`, `byCustomer: true`) and
Yasmina. Confirming a request rotates the token: the first link's hash cannot be turned back into a
link, so the confirmation mail carries a fresh one and the old link stops working.

### Group events

`group_events` (title, description, time, `location`, `capacity`, `series_key`, `status`, and
`offering`, `group` by default, set to `inner_group` for the Inifrån group; migration 0035). The
public list is per offering: `booking.groupEvents({ offering })` (default `group`) returns only that
offering's events, and www's `/api/booking/group-events?offering=` passes it through, so
`/book/group` and `/book/inner_group` never show each other's dates. `admin.bookings.groupEvents.create`
takes `offering` (a group offering only; the admin form at `/admin/bookings/groups` has a select). A seat
is a `bookings` row with `group_event_id`; `seatsLeft` is capacity minus confirmed seats.
`booking.reserve` locks each event row, re-counts, and refuses with `CONFLICT` (`bookingSeatsFull`)
or `NOT_FOUND` (cancelled, past, unknown) before inserting any seat. Cancelling an event
(`admin.bookings.groupEvents.cancel`) cancels every confirmed seat and mails each holder, in one
transaction.

## Admin

Everything under `admin.bookings` is superadmin-only (`NOT_FOUND` to anyone else, like the rest of
`admin.*`): `calendar({from,to})` (bookings with a time, group events and blocks in a range),
`pending()` (requests without a time, oldest first), `get`, `confirm` (takes the calendar lock and
refuses an overlapping time with `CONFLICT`), `decline`, `cancel`, `availability.get/set/block/unblock`,
`groupEvents.create` (one event or a weekly series, each date overlap-checked under the lock,
all-or-nothing) and `groupEvents.cancel`. Each decision writes an `audit_log` row
(`booking.confirmed`, `booking.declined`, `booking.cancelled`, `booking.availability_set`,
`booking.blocked`, `booking.unblocked`, `booking.group_event_created`,
`booking.group_event_cancelled`). The pages live in `apps/auth` under `/admin/bookings`.

## Privacy

Bookings are address-keyed and outlive accounts, like job applications: `privacy.export` lists the
rows whose `customer_email` is the account's verified address (an explicit column list, never the
hashes or the admin's note; the terms version and acceptance time are included, as the
customer's own record of what they agreed to); `users.purge` leaves them. There is no automatic
retention job yet — see **Open** below.

## Open

- No retention/prune job for old bookings; add one (like `applications.prune`) once the retention
  period is decided.
- No payment: a quote follows the intro call. Stripe exists for workspace plans only.
- No calendar sync (ICS attachment, Google Calendar); the mails carry the time as text.
- The site is English; a Swedish booking flow is a second content file plus `x-locale` already
  reaching the api.
