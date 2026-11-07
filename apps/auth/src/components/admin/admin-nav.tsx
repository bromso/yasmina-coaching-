import { cn } from "@repo/ui/lib/utils"
import Link from "next/link"

const items = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/workspaces", label: "Workspaces" },
  { href: "/admin/support", label: "Support" },
  { href: "/admin/applications", label: "Applications" },
  { href: "/admin/audit", label: "Audit log" },
  { href: "/admin/analytics", label: "Analytics" },
] as const

export function AdminNav({ current }: { current: (typeof items)[number]["href"] }) {
  return (
    <nav aria-label="Admin" className="flex flex-wrap gap-1 border-b pb-3">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.href === current ? "page" : undefined}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium hover:bg-muted",
            item.href === current && "bg-muted"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
