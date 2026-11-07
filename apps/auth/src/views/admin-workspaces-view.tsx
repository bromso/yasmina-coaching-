import type { AdminWorkspace } from "@repo/api-contract"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import Link from "next/link"
import { AdminNav } from "@/components/admin/admin-nav"
import { Pager } from "@/components/admin/pager"
import { SearchForm } from "@/components/admin/search-form"
import { formatDateTime } from "@/lib/admin"

export function AdminWorkspacesView({
  items,
  nextCursor,
  q,
}: {
  items: AdminWorkspace[]
  nextCursor: number | null
  q?: string
}) {
  return (
    <>
      <h1 className="text-2xl font-semibold">Workspaces</h1>
      <AdminNav current="/admin/workspaces" />
      <SearchForm action="/admin/workspaces" q={q} placeholder="Name or slug contains" />
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No workspaces match.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <caption className="sr-only">Workspaces, newest first</caption>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Owners</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {w.logoUrl ? (
                        <img
                          src={w.logoUrl}
                          width={24}
                          height={24}
                          alt=""
                          loading="lazy"
                          className="size-6 shrink-0 rounded-sm object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="bg-muted text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-sm text-[10px] font-medium"
                        >
                          {w.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <Link
                        href={`/admin/workspaces/${w.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {w.name}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{w.slug}</TableCell>
                  <TableCell>{w.owners.map((o) => o.email).join(", ") || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{w.memberCount}</TableCell>
                  <TableCell>{w.plan}</TableCell>
                  <TableCell>{w.status ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    <time dateTime={w.createdAt}>{formatDateTime(w.createdAt)}</time>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <Pager href="/admin/workspaces" nextCursor={nextCursor} params={{ q }} />
    </>
  )
}
