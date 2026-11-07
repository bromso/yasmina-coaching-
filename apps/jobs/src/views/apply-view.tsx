import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card"
import type { ReactNode } from "react"
import type { Job } from "@/lib/jobs-core"

export type ApplyViewProps = {
  job: Pick<Job, "title" | "path">
  /** The form itself (the page passes `<ApplyForm slug={job.slug} />`): a slot, so the view holds
   * no client component — mirrors `apps/help`'s `ContactView`. */
  form: ReactNode
}

/** `/<slug>/apply`: a heading naming the role, a link back to the posting, and the apply form. */
export function ApplyView({ job, form }: ApplyViewProps) {
  return (
    <main id="main" className="container flex max-w-2xl flex-col gap-8 py-16">
      <header className="flex flex-col gap-3">
        <a
          href={job.path}
          className="text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground"
        >
          ← Back to {job.title}
        </a>
        <h1 className="font-semibold text-4xl tracking-tight">Apply for {job.title}</h1>
      </header>
      <Card>
        <CardHeader>
          <CardTitle className="sr-only">Apply for {job.title}</CardTitle>
        </CardHeader>
        <CardContent>{form}</CardContent>
      </Card>
    </main>
  )
}
