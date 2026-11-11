import type { AnalyticsSummary } from "@repo/api-contract"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { Area, AreaChart, ChartTooltip, Grid, XAxis } from "@repo/ui/components/charts"
import { navPill } from "@repo/ui/components/nav-pill"
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

const RANGES = [7, 30, 90] as const

const FUNNEL_LABELS: Record<string, string> = {
  signed_up: "Signed up",
  email_verified: "Verified email",
  workspace_created: "Created a workspace",
  activated: "Activated",
}

function RangeNav({ current }: { current: 7 | 30 | 90 }) {
  return (
    <nav aria-label="Date range" className="flex flex-wrap gap-1">
      {RANGES.map((n) => (
        <Link
          key={n}
          href={`/admin/analytics?days=${n}`}
          aria-current={n === current ? "page" : undefined}
          className={navPill({ current: n === current })}
        >
          {n} days
        </Link>
      ))}
    </nav>
  )
}

export function AdminAnalyticsView({
  summary,
  days,
}: {
  summary: AnalyticsSummary
  days: 7 | 30 | 90
}) {
  const chartData = summary.days.map((d) => ({
    date: new Date(`${d.day}T00:00:00.000Z`),
    visitors: d.visitors,
    pageviews: d.pageviews,
  }))
  const signedUp = summary.funnel.find((f) => f.step === "signed_up")?.users ?? 0
  const pct = (users: number) => (signedUp === 0 ? null : (users / signedUp) * 100)

  return (
    <>
      <h1 className="text-2xl font-semibold">Analytics</h1>
      <AdminNav current="/admin/analytics" />
      <p className="text-muted-foreground text-sm">
        Visitors are counted per app per day, so the same person using two apps counts twice.
        Nothing here is per person.
      </p>
      <RangeNav current={days} />
      {days > summary.retentionDays ? (
        <p className="text-muted-foreground text-sm">
          Raw pageviews and events are kept for {summary.retentionDays} days, so the funnel and top
          referrers cover only the last {summary.retentionDays} days of this range.
        </p>
      ) : null}

      <section aria-labelledby="traffic" className="grid gap-3">
        <h2 id="traffic" className="text-lg font-medium">
          Visitors and pageviews
        </h2>
        <Card size="compact">
          <CardHeader>
            <CardTitle>Last {days} days</CardTitle>
            <CardDescription>Area chart of daily visitors and pageviews</CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.every((d) => d.visitors === 0 && d.pageviews === 0) ? (
              <p className="text-muted-foreground text-sm">No traffic in this range yet.</p>
            ) : (
              <div className="w-full">
                <AreaChart data={chartData} aspectRatio="3 / 1">
                  <Grid horizontal />
                  <Area dataKey="pageviews" fill="var(--chart-line-primary)" fillOpacity={0.35} />
                  <Area dataKey="visitors" fill="var(--chart-line-secondary)" fillOpacity={0.35} />
                  <XAxis />
                  <ChartTooltip />
                </AreaChart>
              </div>
            )}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium">Daily totals (table)</summary>
              <div className="mt-2 overflow-x-auto">
                <Table>
                  <caption className="sr-only">Visitors and pageviews per day</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead className="text-right">Visitors</TableHead>
                      <TableHead className="text-right">Pageviews</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.days.map((d) => (
                      <TableRow key={d.day}>
                        <TableCell>
                          <time dateTime={d.day}>{d.day}</time>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{d.visitors}</TableCell>
                        <TableCell className="text-right tabular-nums">{d.pageviews}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </details>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="pages-referrers" className="grid gap-3">
        <h2 id="pages-referrers" className="text-lg font-medium">
          Top pages and referrers
        </h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card size="compact">
            <CardHeader>
              <CardTitle>Top pages</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.topPages.length === 0 ? (
                <p className="text-muted-foreground text-sm">No pageviews in this range yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <caption className="sr-only">The 10 most-viewed pages in this range</caption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>App</TableHead>
                        <TableHead>Path</TableHead>
                        <TableHead className="text-right">Pageviews</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.topPages.map((p) => (
                        <TableRow key={`${p.app}:${p.path}`}>
                          <TableCell>{p.app}</TableCell>
                          <TableCell className="font-mono text-xs">{p.path}</TableCell>
                          <TableCell className="text-right tabular-nums">{p.pageviews}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
          <Card size="compact">
            <CardHeader>
              <CardTitle>Top referrers</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.topReferrers.length === 0 ? (
                <p className="text-muted-foreground text-sm">No referrers in this range yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <caption className="sr-only">
                      The 10 most frequent referrer hosts in this range
                    </caption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Host</TableHead>
                        <TableHead className="text-right">Pageviews</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.topReferrers.map((r) => (
                        <TableRow key={r.host}>
                          <TableCell className="font-mono text-xs">{r.host}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.pageviews}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section aria-labelledby="events" className="grid gap-3">
        <h2 id="events" className="text-lg font-medium">
          Events
        </h2>
        <Card size="compact">
          <CardHeader>
            <CardDescription>Product event counts per day</CardDescription>
          </CardHeader>
          <CardContent>
            {summary.events.length === 0 ? (
              <p className="text-muted-foreground text-sm">No events in this range yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <caption className="sr-only">Product events per day</caption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Day</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.events.map((e) => (
                      <TableRow key={`${e.day}:${e.name}`}>
                        <TableCell>
                          <time dateTime={e.day}>{e.day}</time>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{e.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{e.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="funnel" className="grid gap-3">
        <h2 id="funnel" className="text-lg font-medium">
          Funnel
        </h2>
        <Card size="compact">
          <CardHeader>
            <CardDescription>
              Signed up, then of those verified their email, then created a workspace, then
              activated (accepted an invitation or created a note) — all within this range
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <caption className="sr-only">
                  The sign-up funnel: counts and percentage of signed-up users at each step
                </caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Step</TableHead>
                    <TableHead className="text-right">Users</TableHead>
                    <TableHead className="text-right">% of signed up</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.funnel.map((f) => {
                    const p = pct(f.users)
                    return (
                      <TableRow key={f.step}>
                        <TableCell>{FUNNEL_LABELS[f.step] ?? f.step}</TableCell>
                        <TableCell className="text-right tabular-nums">{f.users}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {p === null ? "—" : `${p.toFixed(0)}%`}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>
    </>
  )
}
