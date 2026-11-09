import { describe, expect, mock, test } from "bun:test"
import type { AdminBooking } from "@repo/api-contract"
import { renderToStaticMarkup } from "react-dom/server"

// The forms import their server actions, which reach @repo/session: `server-only` throws outside
// a react-server bundle, so stub it before the dynamic import below.
mock.module("server-only", () => ({}))
const { AdminBookingView } = await import("./admin-booking-view")
const { AdminBookingsView } = await import("./admin-bookings-view")

const booking = (over: Partial<AdminBooking> = {}): AdminBooking => ({
  id: 12,
  reference: "BK-12",
  offering: "workshop",
  status: "pending",
  startsAt: null,
  endsAt: null,
  location: "on_site",
  groupEvent: null,
  cancellable: false,
  createdAt: "2026-06-01T10:00:00.000Z",
  audience: "organisation",
  customer: { name: "Ada", email: "ada@example.com", organisation: "Acme", phone: null },
  notes: "Please come to <b>our</b> office.\nSecond line.",
  preferredDates: [{ date: "2026-06-10", part: "morning" }],
  attendees: 12,
  venue: null,
  packageId: null,
  adminNote: null,
  decidedAt: null,
  decidedBy: null,
  cancelledAt: null,
  ...over,
})
const now = "2026-06-02T00:00:00.000Z"

describe("AdminBookingView", () => {
  test("shows the message as escaped, pre-wrapped text and the Confirm/Decline forms for a request", () => {
    const html = renderToStaticMarkup(<AdminBookingView booking={booking()} now={now} />)
    expect(html).toMatch(/<pre class="[^"]*whitespace-pre-wrap[^"]*">/)
    expect(html).not.toContain("<b>our</b>")
    expect(html).toContain("&lt;b&gt;our&lt;/b&gt;")
    expect(html).toContain('name="startsAt"')
    expect(html).toContain('value="2026-06-10T09:00"')
    expect(html).toContain("Decline request")
    expect(html).not.toContain("Cancel booking")
    // The location select offers only what a workshop can be: on site or video, never Varberg.
    expect(html).toContain('<option value="on_site" selected="">')
    expect(html).toContain('<option value="video">')
    expect(html).not.toContain('<option value="varberg">')
  })

  test("a confirmed future booking gets Cancel and Stockholm times; a past one gets no form", () => {
    const confirmed = booking({
      status: "confirmed",
      startsAt: "2026-06-10T07:00:00.000Z",
      endsAt: "2026-06-10T11:00:00.000Z",
    })
    const future = renderToStaticMarkup(<AdminBookingView booking={confirmed} now={now} />)
    expect(future).toContain("Cancel booking")
    expect(future).not.toContain("Confirm booking")
    expect(future).toContain("Wed 10 Jun 2026, 09:00")
    const past = renderToStaticMarkup(
      <AdminBookingView booking={confirmed} now="2026-07-01T00:00:00.000Z" />
    )
    expect(past).not.toContain("Cancel booking")
  })
})

describe("AdminBookingsView", () => {
  test("renders a Monday-first table, shades blocked days and lists the month below", () => {
    const html = renderToStaticMarkup(
      <AdminBookingsView
        month={{ year: 2026, month: 6 }}
        today="2026-06-02"
        pending={[booking()]}
        bookings={[
          booking({
            id: 3,
            reference: "BK-3",
            offering: "session",
            status: "confirmed",
            startsAt: "2026-06-10T07:00:00.000Z",
            endsAt: "2026-06-10T08:00:00.000Z",
            location: "video",
          }),
          booking({ id: 4, status: "cancelled", startsAt: "2026-06-11T07:00:00.000Z" }),
        ]}
        groupEvents={[
          {
            id: 5,
            reference: "GE-5",
            title: "Breathing",
            description: null,
            offering: "group",
            startsAt: "2026-06-12T16:00:00.000Z",
            endsAt: "2026-06-12T18:00:00.000Z",
            location: "varberg",
            capacity: 8,
            seatsLeft: 5,
            seriesKey: null,
          },
        ]}
        blocks={[{ id: 1, from: "2026-06-20", to: "2026-06-21", reason: "Away" }]}
      />
    )
    expect(html).toContain('<th scope="col"')
    expect(html).toMatch(/<abbr[^>]*>Mon<\/abbr>/)
    expect(html).toContain('<time dateTime="2026-06-01"')
    expect(html).toContain('aria-current="date"')
    expect(html).toContain("Open BK-12")
    expect(html).toContain("09:00")
    expect(html).toContain("Coaching session, Ada")
    expect(html).toContain("Breathing (3/8 seats)")
    expect(html).toMatch(/<td[^>]*bg-muted[^>]*>.*?2026-06-20/)
    expect(html).toContain("Wed 10 Jun 2026, 09:00")
    expect(html).toContain("?month=2026-05")
    expect(html).toContain("?month=2026-07")
    // A cancelled booking is neither in the grid nor in the list.
    expect(html).not.toContain("/admin/bookings/4")
  })
})
