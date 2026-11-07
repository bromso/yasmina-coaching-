import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { Job } from "@/lib/jobs-core"
import { ApplyView } from "./apply-view"
import { HomeView } from "./home-view"
import { JobView } from "./job-view"

function job(overrides: Partial<Job> = {}): Job {
  return {
    slug: "senior-fullstack-engineer",
    path: "/senior-fullstack-engineer",
    title: "Senior Full-stack Engineer",
    description: "Build the product end to end.",
    team: "Engineering",
    location: "Remote (US)",
    employment: "full-time",
    posted: "2026-09-15",
    status: "open",
    open: true,
    ...overrides,
  }
}

describe("HomeView", () => {
  test("a team filter link and a section per team, one card per open role", () => {
    const teams = [
      { team: "Engineering", jobs: [job()] },
      {
        team: "Customer Experience",
        jobs: [
          job({
            slug: "product-designer",
            path: "/product-designer",
            title: "Product Designer",
            team: "Customer Experience",
            location: "Berlin, Germany",
          }),
        ],
      },
    ]
    const html = renderToStaticMarkup(<HomeView teams={teams} />)
    expect(html).toContain('aria-label="Teams"')
    expect(html).toContain('href="#team-engineering"')
    expect(html).toContain('href="#team-customer-experience"')
    expect(html).toContain('id="team-engineering"')
    expect(html).toContain("Engineering (1)")
    expect(html).toContain('href="/senior-fullstack-engineer"')
    expect(html).toContain("Senior Full-stack Engineer</a>")
    expect(html).toContain("Remote (US) · Full-time")
    expect(html).toContain('href="/product-designer"')
    expect(html).toContain("Berlin, Germany · Full-time")
  })

  test("no open roles: no team nav, the empty-state copy shows, no section renders", () => {
    const html = renderToStaticMarkup(<HomeView teams={[]} />)
    expect(html).not.toContain('aria-label="Teams"')
    expect(html).toContain("No open roles right now")
  })

  test("a closed role is simply absent from the teams prop — the view renders only what it's given", () => {
    const html = renderToStaticMarkup(<HomeView teams={[{ team: "Engineering", jobs: [job()] }]} />)
    expect(html).not.toContain("closed")
  })
})

function Body() {
  return <p>The body.</p>
}

describe("JobView", () => {
  test("open role: facts list, body, Apply link, and JobPosting JSON-LD", () => {
    const html = renderToStaticMarkup(
      <JobView job={job()} Body={Body} siteUrl="https://jobs.brand.com" brand="Acme" />
    )
    expect(html).toContain("Senior Full-stack Engineer</h1>")
    expect(html).toContain("<dt")
    expect(html).toContain("Engineering</dd>")
    expect(html).toContain("Remote (US)</dd>")
    expect(html).toContain("Full-time</dd>")
    expect(html).not.toContain(">Salary<")
    expect(html).toContain("<p>The body.</p>")
    expect(html).toContain('href="/senior-fullstack-engineer/apply"')
    expect(html).toContain("Apply for this role")
    expect(html).not.toContain("This role is closed")
    expect(html).toContain('"@type":"JobPosting"')
  })

  test("salary shown only when set", () => {
    const html = renderToStaticMarkup(
      <JobView
        job={job({ salary: "$140,000–$170,000 USD" })}
        Body={Body}
        siteUrl="https://jobs.brand.com"
        brand="Acme"
      />
    )
    expect(html).toContain("Salary</dt>")
    expect(html).toContain("$140,000–$170,000 USD</dd>")
  })

  test("closed role: no Apply link, a closed notice, no JSON-LD", () => {
    const html = renderToStaticMarkup(
      <JobView
        job={job({ status: "open", closes: "2026-01-31", open: false })}
        Body={Body}
        siteUrl="https://jobs.brand.com"
        brand="Acme"
      />
    )
    expect(html).not.toContain("Apply for this role")
    expect(html).toContain("This role is closed.")
    expect(html).not.toContain("application/ld+json")
    expect(html).toContain("Closes</dt>")
  })
})

describe("ApplyView", () => {
  test("a heading naming the role, a link back to the posting, and the form slot", () => {
    const html = renderToStaticMarkup(<ApplyView job={job()} form={<p>The form.</p>} />)
    expect(html).toContain("Apply for Senior Full-stack Engineer</h1>")
    expect(html).toContain('href="/senior-fullstack-engineer"')
    expect(html).toContain("<p>The form.</p>")
  })
})
