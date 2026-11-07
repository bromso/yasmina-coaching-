import type { AuditEntry } from "@repo/api-contract"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import Link from "next/link"
import { formatDateTime } from "@/lib/admin"

/** An entry with no actor: the purge's own `user.deleted` row, else an account deleted since. */
export const actorFallback = (action: string) =>
  action === "user.deleted" ? "System" : "Deleted user"

export function AuditTable({ items, caption }: { items: AuditEntry[]; caption: string }) {
  if (items.length === 0)
    return <p className="text-muted-foreground text-sm">No audit entries yet.</p>
  return (
    <div className="overflow-x-auto">
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            <TableHead>When</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Actor</TableHead>
            <TableHead>As</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Reason / details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((e) => (
            <TableRow key={e.id}>
              <TableCell className="whitespace-nowrap">
                <time dateTime={e.at}>{formatDateTime(e.at)}</time>
              </TableCell>
              <TableCell className="font-mono text-xs">{e.action}</TableCell>
              <TableCell>
                {e.actor ? (
                  <Link
                    href={`/admin/users/${e.actor.id}`}
                    className="underline underline-offset-4"
                  >
                    {e.actor.email}
                  </Link>
                ) : (
                  actorFallback(e.action)
                )}
              </TableCell>
              <TableCell>
                {e.impersonated ? (
                  <Link
                    href={`/admin/users/${e.impersonated.id}`}
                    className="underline underline-offset-4"
                  >
                    {e.impersonated.email}
                  </Link>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {e.targetType === "user" && e.targetId ? (
                  <Link
                    href={`/admin/users/${e.targetId}`}
                    className="underline underline-offset-4"
                  >
                    user {e.targetId}
                  </Link>
                ) : e.targetType === "workspace" && e.targetId ? (
                  <Link
                    href={`/admin/workspaces/${e.targetId}`}
                    className="underline underline-offset-4"
                  >
                    workspace {e.targetId}
                  </Link>
                ) : e.targetType ? (
                  `${e.targetType} ${e.targetId ?? ""}`
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell
                className="max-w-xs truncate text-muted-foreground"
                title={e.metadata ? JSON.stringify(e.metadata) : undefined}
              >
                {e.reason ?? (e.metadata ? JSON.stringify(e.metadata) : "")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
