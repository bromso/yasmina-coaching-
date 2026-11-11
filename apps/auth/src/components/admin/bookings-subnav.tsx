import { navPill } from "@repo/ui/components/nav-pill"
import Link from "next/link"

const items = [
  { href: "/admin/bookings", label: "Calendar" },
  { href: "/admin/bookings/availability", label: "Availability" },
  { href: "/admin/bookings/groups", label: "Group events" },
] as const

export type BookingsSection = (typeof items)[number]["href"]

/** The second row under `AdminNav` on every booking page. */
export function BookingsSubnav({ current }: { current: BookingsSection }) {
  return (
    <nav aria-label="Bookings" className="flex flex-wrap gap-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.href === current ? "page" : undefined}
          className={navPill({ current: item.href === current })}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
