import type { AdminUser } from "@repo/api-contract"
import { Badge } from "@repo/ui/components/badge"
import { Label } from "@repo/ui/components/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import { initialsOf } from "@repo/ui/lib/initials"
import Link from "next/link"
import { AdminNav } from "@/components/admin/admin-nav"
import { Pager } from "@/components/admin/pager"
import { SearchForm } from "@/components/admin/search-form"
import { formatDateTime } from "@/lib/admin"

export function AdminUsersView({
  items,
  nextCursor,
  q,
  suspended,
}: {
  items: AdminUser[]
  nextCursor: number | null
  q?: string
  /** `?suspended=true`: only accounts an active suspension blocks right now. */
  suspended?: boolean
}) {
  return (
    <>
      <h1 className="text-2xl font-semibold">Users</h1>
      <AdminNav current="/admin/users" />
      <SearchForm action="/admin/users" q={q} placeholder="Email starts with, or name contains">
        <div className="flex items-center gap-2 pb-2">
          {/* Native, not the Radix Checkbox: that one submits its value only once hydrated. */}
          <input
            type="checkbox"
            id="suspended"
            name="suspended"
            value="true"
            defaultChecked={suspended}
            className="size-4 accent-primary"
          />
          <Label htmlFor="suspended">Suspended only</Label>
        </div>
      </SearchForm>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No users match.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <caption className="sr-only">Users, newest first</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead>Providers</TableHead>
                <TableHead className="text-right">Workspaces</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {u.avatarUrl ? (
                        <img
                          src={u.avatarUrl}
                          width={24}
                          height={24}
                          alt=""
                          loading="lazy"
                          className="size-6 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium"
                        >
                          {initialsOf(u)}
                        </span>
                      )}
                      <Link
                        href={`/admin/users/${u.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {u.email}
                      </Link>
                      {u.superadmin && <Badge variant="secondary">superadmin</Badge>}
                      {u.suspended?.active && <Badge variant="destructive">Suspended</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>{u.name || "—"}</TableCell>
                  <TableCell>{u.emailVerified ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    {[u.hasPassword ? "password" : null, ...u.providers]
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{u.workspaceCount}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <time dateTime={u.createdAt}>{formatDateTime(u.createdAt)}</time>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager
        href="/admin/users"
        nextCursor={nextCursor}
        params={{ q, suspended: suspended ? "true" : undefined }}
      />
    </>
  )
}
