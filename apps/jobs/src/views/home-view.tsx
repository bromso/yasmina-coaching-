import { Card, Cards } from "@repo/ui/components/mdx"
import { JOBS_HOME } from "@/content/home"
import { EMPLOYMENT_LABEL, type Job, teamAnchor } from "@/lib/jobs-core"

export type HomeViewProps = {
  /** Open roles, grouped by team (`jobsByTeam(openJobs())`): team order alphabetical, roles in
   * posting order within a team. A closed role is never in this list. */
  teams: { team: string; jobs: Job[] }[]
}

/**
 * `/`: the jobs board's home page — an intro, a team filter row (plain anchor links, no
 * JavaScript, no query) and one card per open role under its own team section.
 */
export function HomeView({ teams }: HomeViewProps) {
  return (
    <main id="main" className="container flex max-w-5xl flex-col gap-12 py-16">
      <header className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="font-semibold text-4xl tracking-tight">{JOBS_HOME.title}</h1>
          <p className="text-lg text-muted-foreground">{JOBS_HOME.intro}</p>
        </div>
        {teams.length > 0 && (
          <nav aria-label="Teams" className="flex flex-wrap gap-4 text-sm">
            {teams.map((group) => (
              <a
                key={group.team}
                href={`#${teamAnchor(group.team)}`}
                className="underline-offset-4 hover:underline"
              >
                {group.team} ({group.jobs.length})
              </a>
            ))}
          </nav>
        )}
      </header>

      {teams.length === 0 && <p className="text-muted-foreground">{JOBS_HOME.empty}</p>}

      {teams.map((group) => {
        const anchor = teamAnchor(group.team)
        return (
          <section
            key={group.team}
            id={anchor}
            aria-labelledby={`${anchor}-heading`}
            className="flex flex-col gap-6"
          >
            <h2 id={`${anchor}-heading`} className="font-semibold text-2xl tracking-tight">
              {group.team}
            </h2>
            <Cards>
              {group.jobs.map((job) => (
                <Card key={job.slug} title={job.title} href={job.path}>
                  {job.location} · {EMPLOYMENT_LABEL[job.employment]}
                </Card>
              ))}
            </Cards>
          </section>
        )
      })}
    </main>
  )
}
