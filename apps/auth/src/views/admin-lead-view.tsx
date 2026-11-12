import type { AdminLead } from "@repo/api-contract"
import {
  LEAD_AUDIENCE_LABELS,
  LEAD_CONTACT_METHOD_LABELS,
  LEAD_NEED_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_TIMELINE_LABELS,
  leadNextStep,
} from "@repo/api-contract/leads"
import { Badge } from "@repo/ui/components/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import Link from "next/link"
import { AdminNav } from "@/components/admin/admin-nav"
import { DeleteLeadForm } from "@/components/admin/delete-lead-form"
import { LeadUpdateForm } from "@/components/admin/lead-update-form"
import { formatDateTime } from "@/lib/admin"

const NEXT_STEP_LABELS = {
  inner: "Book the inifrån start call",
  coaching: "Free intro call, or book a session",
  proposal: "Send a proposal",
  explore: "Reading (two blog posts and /inifran)",
} as const

/** A `tel:` target from what the visitor typed: digits and a leading `+` only. */
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`

/**
 * `/admin/leads/<id>`: every answer, the message as plain text, mailto and phone links, the next
 * step the visitor was shown, and the status and notes form.
 */
export function AdminLeadView({ lead }: { lead: AdminLead }) {
  const next = leadNextStep(lead)
  const rows: [string, React.ReactNode][] = [
    ["Writing for", LEAD_AUDIENCE_LABELS[lead.audience]],
    ["Wants help with", LEAD_NEED_LABELS[lead.need]],
    ["How soon", LEAD_TIMELINE_LABELS[lead.timeline]],
    ["Shown next step", `${NEXT_STEP_LABELS[next.kind]} (${next.path})`],
    ["Name", lead.name],
    [
      "Email",
      <a key="email" href={`mailto:${lead.email}`} className="underline-offset-4 hover:underline">
        {lead.email}
      </a>,
    ],
    [
      "Phone",
      lead.phone ? (
        <a key="phone" href={telHref(lead.phone)} className="underline-offset-4 hover:underline">
          {lead.phone}
        </a>
      ) : (
        "—"
      ),
    ],
    ["Organisation", lead.organisation ?? "—"],
    ["Role", lead.role ?? "—"],
    ["Prefers", LEAD_CONTACT_METHOD_LABELS[lead.contactMethod]],
    ["Newsletter", lead.newsletter ? "Yes (stored only, nothing is sent)" : "No"],
    ["Language", lead.locale ?? "en"],
    ["Page", lead.page ?? "—"],
    [
      "Received",
      <time key="at" dateTime={lead.createdAt}>
        {formatDateTime(lead.createdAt)}
      </time>,
    ],
    [
      "Deleted after",
      <time key="del" dateTime={lead.deleteAfter}>
        {formatDateTime(lead.deleteAfter)}
      </time>,
    ],
  ]
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{lead.name}</h1>
        <span className="font-mono text-sm text-muted-foreground">{lead.reference}</span>
        <Badge variant={lead.status === "new" ? "default" : "secondary"}>
          {LEAD_STATUS_LABELS[lead.status]}
        </Badge>
      </div>
      <AdminNav current="/admin/leads" />
      <p>
        <Link href="/admin/leads" className="text-sm underline-offset-4 hover:underline">
          All leads
        </Link>
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Answers</CardTitle>
            <CardDescription>What the visitor sent from the contact form.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-2 break-words text-sm">
              {rows.map(([label, content]) => (
                <div key={label} className="contents">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd>{content}</dd>
                </div>
              ))}
            </dl>
            {lead.message && (
              <div className="grid gap-1.5">
                <h2 className="font-medium text-sm">Message</h2>
                <pre className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-sans text-sm">
                  {lead.message}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Follow-up</CardTitle>
            <CardDescription>
              {lead.statusChangedBy && lead.statusChangedAt ? (
                <>
                  Status set by {lead.statusChangedBy.email} on{" "}
                  <time dateTime={lead.statusChangedAt}>
                    {formatDateTime(lead.statusChangedAt)}
                  </time>
                </>
              ) : (
                "Your notes are never shown to the visitor."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LeadUpdateForm id={lead.id} status={lead.status} notes={lead.notes} />
            <div className="mt-6 border-t pt-4">
              <DeleteLeadForm id={lead.id} />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
