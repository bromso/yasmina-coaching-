import { describe, expect, test } from "bun:test"
import { ContentError } from "@repo/content/posts"
import type { JobFrontmatter } from "@repo/content/schema"
import {
  assembleJobs,
  closesProblems,
  EMPLOYMENT_LABEL,
  isOpen,
  type Job,
  type JobInput,
  jobsByTeam,
  jobsKnownPaths,
  nestingProblems,
  reservedProblems,
  teamAnchor,
} from "./jobs-core"

function frontmatter(overrides: Partial<JobFrontmatter> = {}): JobFrontmatter {
  return {
    title: "Senior Full-stack Engineer",
    description: "Build the product end to end.",
    team: "Engineering",
    location: "Remote (US)",
    employment: "full-time",
    posted: "2026-01-01",
    status: "open",
    kind: "Job Posting",
    ...overrides,
  }
}

function jobInput(slug: string, source = "", overrides: Partial<JobInput> = {}): JobInput {
  return {
    file: `apps/jobs/content/jobs/${slug}.mdx`,
    slug,
    frontmatter: frontmatter(),
    source,
    images: [],
    ...overrides,
  }
}

describe("isOpen", () => {
  test("open with no closes is open", () => {
    expect(isOpen({ status: "open" }, "2026-01-01")).toBe(true)
  })

  test("closed status is never open, even with closes in the future", () => {
    expect(isOpen({ status: "closed", closes: "2099-01-01" }, "2026-01-01")).toBe(false)
  })

  test("closes today is still open", () => {
    expect(isOpen({ status: "open", closes: "2026-06-15" }, "2026-06-15")).toBe(true)
  })

  test("closes yesterday is closed", () => {
    expect(isOpen({ status: "open", closes: "2026-06-14" }, "2026-06-15")).toBe(false)
  })

  test("closes tomorrow is still open", () => {
    expect(isOpen({ status: "open", closes: "2026-06-16" }, "2026-06-15")).toBe(true)
  })
})

describe("nestingProblems", () => {
  test("a one-segment posting passes; a subfolder is reported", () => {
    expect(
      nestingProblems([
        { file: "apps/jobs/content/jobs/engineer.mdx", slugs: ["engineer"] },
        { file: "apps/jobs/content/jobs/2026/designer.mdx", slugs: ["2026", "designer"] },
      ])
    ).toEqual([
      "apps/jobs/content/jobs/2026/designer.mdx: job postings must sit directly in content/jobs/",
    ])
  })
})

describe("reservedProblems", () => {
  test("a reserved slug is reported, naming its file", () => {
    expect(
      reservedProblems([
        { slug: "apply", file: "apps/jobs/content/jobs/apply.mdx" },
        { slug: "og", file: "apps/jobs/content/jobs/og.mdx" },
        { slug: "engineer", file: "apps/jobs/content/jobs/engineer.mdx" },
      ])
    ).toEqual([
      'apps/jobs/content/jobs/apply.mdx: "apply" is reserved (it would be shadowed by a built-in route)',
      'apps/jobs/content/jobs/og.mdx: "og" is reserved (it would be shadowed by a built-in route)',
    ])
  })
})

describe("closesProblems", () => {
  test("closes before posted is reported", () => {
    expect(
      closesProblems([
        {
          file: "apps/jobs/content/jobs/engineer.mdx",
          frontmatter: { posted: "2026-02-01", closes: "2026-01-01" },
        },
      ])
    ).toEqual([
      'apps/jobs/content/jobs/engineer.mdx: "closes" (2026-01-01) is before "posted" (2026-02-01)',
    ])
  })

  test("closes equal to or after posted, or absent, is fine", () => {
    expect(
      closesProblems([
        { file: "a", frontmatter: { posted: "2026-01-01", closes: "2026-01-01" } },
        { file: "b", frontmatter: { posted: "2026-01-01", closes: "2026-02-01" } },
        { file: "c", frontmatter: { posted: "2026-01-01" } },
      ])
    ).toEqual([])
  })
})

describe("jobsKnownPaths", () => {
  test("every posting plus /<slug>/apply for an open one only", () => {
    expect(
      [
        ...jobsKnownPaths([
          { slug: "engineer", open: true },
          { slug: "designer", open: false },
        ]),
      ].sort()
    ).toEqual(["/", "/designer", "/engineer", "/engineer/apply"].sort())
  })
})

describe("jobsByTeam", () => {
  function job(team: string, slug: string): Job {
    return {
      slug,
      path: `/${slug}`,
      title: slug,
      description: "d",
      team,
      location: "Remote",
      employment: "full-time",
      posted: "2026-01-01",
      status: "open",
      open: true,
    }
  }

  test("groups jobs by team, team order alphabetical by team name", () => {
    const grouped = jobsByTeam([job("Sales", "a"), job("Engineering", "b"), job("Sales", "c")])
    expect(grouped.map((g) => g.team)).toEqual(["Engineering", "Sales"])
    expect(grouped.find((g) => g.team === "Sales")?.jobs.map((j) => j.slug)).toEqual(["a", "c"])
  })
})

describe("EMPLOYMENT_LABEL", () => {
  test("every employment value has a display label", () => {
    expect(EMPLOYMENT_LABEL["full-time"]).toBe("Full-time")
    expect(EMPLOYMENT_LABEL["part-time"]).toBe("Part-time")
    expect(EMPLOYMENT_LABEL.contract).toBe("Contract")
  })
})

describe("teamAnchor", () => {
  test("lowercased, spaces collapsed to one hyphen", () => {
    expect(teamAnchor("Engineering")).toBe("team-engineering")
    expect(teamAnchor("Customer Experience")).toBe("team-customer-experience")
  })

  test("non-alphanumeric runs collapse to one hyphen, with no leading or trailing hyphen", () => {
    expect(teamAnchor("R&D / Platform")).toBe("team-r-d-platform")
  })
})

const known = { hosts: new Set<string>(), ownHost: "jobs.example.com" }
const noImages = () => false
const allImages = () => true
const today = "2026-06-15"

function problemsOf(run: () => unknown): string[] {
  try {
    run()
  } catch (error) {
    if (error instanceof ContentError) return error.problems
    throw error
  }
  throw new Error("expected assembleJobs to throw")
}

describe("assembleJobs", () => {
  test("clean postings build jobs with open computed from status and closes", () => {
    const result = assembleJobs(
      [
        jobInput("engineer", "", { frontmatter: frontmatter() }),
        jobInput("designer", "", {
          frontmatter: frontmatter({ status: "closed", closes: "2026-01-01" }),
        }),
      ],
      [],
      known,
      allImages,
      today
    )
    expect(result.jobs.map((j) => ({ slug: j.slug, open: j.open }))).toEqual([
      { slug: "engineer", open: true },
      { slug: "designer", open: false },
    ])
    expect(result.jobs[0]?.path).toBe("/engineer")
  })

  test("prior problems (nesting) join the same ContentError", () => {
    const problems = problemsOf(() =>
      assembleJobs(
        [jobInput("engineer")],
        ["x: job postings must sit directly in content/jobs/"],
        known,
        allImages,
        today
      )
    )
    expect(problems).toEqual(["x: job postings must sit directly in content/jobs/"])
  })

  test("a reserved slug and closes-before-posted join one ContentError", () => {
    const problems = problemsOf(() =>
      assembleJobs(
        [
          jobInput("apply"),
          jobInput("designer", "", {
            frontmatter: frontmatter({ posted: "2026-02-01", closes: "2026-01-01" }),
          }),
        ],
        [],
        known,
        allImages,
        today
      )
    )
    expect(problems).toEqual([
      'apps/jobs/content/jobs/apply.mdx: "apply" is reserved (it would be shadowed by a built-in route)',
      'apps/jobs/content/jobs/designer.mdx: "closes" (2026-01-01) is before "posted" (2026-02-01)',
    ])
  })

  test("a body h1 in one posting and a broken link in another make ONE ContentError", () => {
    const problems = problemsOf(() =>
      assembleJobs(
        [jobInput("engineer", "# Senior engineer"), jobInput("designer", "See [nowhere](/nope).")],
        [],
        known,
        allImages,
        today
      )
    )
    expect(problems).toEqual([
      'apps/jobs/content/jobs/engineer.mdx: use "##" for headings — the posting title is the page\'s h1',
      'apps/jobs/content/jobs/designer.mdx: broken link "/nope"',
    ])
  })

  test("a link to another posting, and to an open posting's apply route, is accepted", () => {
    const result = assembleJobs(
      [
        jobInput("engineer", "See [designer](/designer) or [apply](/engineer/apply)."),
        jobInput("designer"),
      ],
      [],
      known,
      allImages,
      today
    )
    expect(result.jobs.map((j) => j.slug)).toEqual(["engineer", "designer"])
  })

  test("a link to a closed posting's apply route is broken", () => {
    const problems = problemsOf(() =>
      assembleJobs(
        [
          jobInput("engineer", "[Apply](/designer/apply)."),
          jobInput("designer", "", {
            frontmatter: frontmatter({ status: "closed" }),
          }),
        ],
        [],
        known,
        allImages,
        today
      )
    )
    expect(problems).toEqual(['apps/jobs/content/jobs/engineer.mdx: broken link "/designer/apply"'])
  })

  test("a link to a local development host is reported", () => {
    const problems = problemsOf(() =>
      assembleJobs(
        [jobInput("engineer", "[Local](http://localhost:3000/x)")],
        [],
        known,
        allImages,
        today
      )
    )
    expect(problems).toEqual([
      'apps/jobs/content/jobs/engineer.mdx: link "http://localhost:3000/x" points at a local development host',
    ])
  })

  test("a missing image joins the same ContentError", () => {
    const problems = problemsOf(() =>
      assembleJobs(
        [jobInput("engineer", "", { images: ["/diagram.png"] })],
        [],
        known,
        noImages,
        today
      )
    )
    expect(problems).toEqual([
      'apps/jobs/content/jobs/engineer.mdx: image "/diagram.png" not found in public/',
    ])
  })
})
