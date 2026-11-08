import { describe, expect, test } from "bun:test"
import type { Post } from "./posts"
import type { Author } from "./schema"
import { blogPostingJsonLd, type JobPostingInput, jobPostingJsonLd } from "./seo"

const author: Author = { name: "Jane Doe", bio: "Writes things.", avatar: "/avatars/jane.png" }

function post(overrides: Partial<Post> = {}): Post {
  return {
    slug: "example",
    url: "/example",
    title: "Example post",
    description: "An example",
    date: new Date("2026-01-01T00:00:00Z"),
    author: "jane",
    tags: ["bun"],
    type: "Blog Post",
    locale: "en",
    readingMinutes: 3,
    ...overrides,
  }
}

describe("blogPostingJsonLd", () => {
  test("names the post's language", () => {
    const parsed = JSON.parse(blogPostingJsonLd(post({ locale: "sv" }), author, "https://x.se/hej"))
    expect(parsed.inLanguage).toBe("sv")
  })

  test("contains the BlogPosting type, dates, and author name", () => {
    const json = blogPostingJsonLd(post(), author, "http://blog.brand.localhost:3009/example")
    expect(json).toContain(`"@type":"BlogPosting"`)
    const parsed = JSON.parse(json)
    expect(parsed.datePublished).toBe("2026-01-01T00:00:00.000Z")
    expect(parsed.author.name).toBe("Jane Doe")
  })

  test("dateModified falls back to date when updated is absent", () => {
    const parsed = JSON.parse(blogPostingJsonLd(post(), author, "http://x/example"))
    expect(parsed.dateModified).toBe(parsed.datePublished)
  })

  test("dateModified uses updated when present", () => {
    const updated = new Date("2026-02-01T00:00:00Z")
    const parsed = JSON.parse(blogPostingJsonLd(post({ updated }), author, "http://x/example"))
    expect(parsed.dateModified).toBe(updated.toISOString())
  })

  test("a title containing </script> is escaped so it cannot close the tag", () => {
    const json = blogPostingJsonLd(
      post({ title: "Why </script> matters" }),
      author,
      "http://x/example"
    )
    expect(json).not.toContain("</script>")
    expect(json).toContain("\\u003c/script>")
    expect(JSON.parse(json).headline).toBe("Why </script> matters")
  })

  test("mainEntityOfPage names the post's own WebPage", () => {
    const url = "https://blog.brand.com/example"
    const parsed = JSON.parse(blogPostingJsonLd(post(), author, url))
    expect(parsed.mainEntityOfPage).toEqual({ "@type": "WebPage", "@id": url })
  })

  test("a root-relative cover becomes an absolute image", () => {
    const cover = { src: "/covers/example.png", alt: "A cover" }
    const parsed = JSON.parse(
      blogPostingJsonLd(post({ cover }), author, "https://blog.brand.com/example")
    )
    expect(parsed.image).toBe("https://blog.brand.com/covers/example.png")
  })

  test("an absolute cover is kept as it is, and no cover means no image", () => {
    const cover = { src: "https://cdn.example.org/c.png", alt: "A cover" }
    const url = "https://blog.brand.com/example"
    expect(JSON.parse(blogPostingJsonLd(post({ cover }), author, url)).image).toBe(cover.src)
    expect(JSON.parse(blogPostingJsonLd(post(), author, url)).image).toBeUndefined()
  })
})

function job(overrides: Partial<JobPostingInput> = {}): JobPostingInput {
  return {
    path: "/senior-engineer",
    title: "Senior Full-stack Engineer",
    description: "Build the product end to end.",
    employment: "full-time",
    location: "Stockholm, Sweden",
    posted: "2026-01-02",
    ...overrides,
  }
}

const jobsSiteUrl = "https://jobs.brand.com"

describe("jobPostingJsonLd", () => {
  test("contains the JobPosting type, title, description and datePosted", () => {
    const json = jobPostingJsonLd(job(), { siteUrl: jobsSiteUrl, brand: "Acme" })
    expect(json).toContain(`"@type":"JobPosting"`)
    const parsed = JSON.parse(json)
    expect(parsed.title).toBe("Senior Full-stack Engineer")
    expect(parsed.description).toBe("Build the product end to end.")
    expect(parsed.datePosted).toBe("2026-01-02")
  })

  test("url resolves job.path against siteUrl", () => {
    const parsed = JSON.parse(jobPostingJsonLd(job(), { siteUrl: jobsSiteUrl, brand: "Acme" }))
    expect(parsed.url).toBe("https://jobs.brand.com/senior-engineer")
  })

  test("validThrough is set only when closes is present", () => {
    const withClose = JSON.parse(
      jobPostingJsonLd(job({ closes: "2026-03-01" }), { siteUrl: jobsSiteUrl, brand: "Acme" })
    )
    expect(withClose.validThrough).toBe("2026-03-01")
    const withoutClose = JSON.parse(
      jobPostingJsonLd(job(), { siteUrl: jobsSiteUrl, brand: "Acme" })
    )
    expect(withoutClose.validThrough).toBeUndefined()
  })

  test("employmentType maps full-time, part-time and contract", () => {
    expect(
      JSON.parse(
        jobPostingJsonLd(job({ employment: "full-time" }), { siteUrl: jobsSiteUrl, brand: "Acme" })
      ).employmentType
    ).toBe("FULL_TIME")
    expect(
      JSON.parse(
        jobPostingJsonLd(job({ employment: "part-time" }), { siteUrl: jobsSiteUrl, brand: "Acme" })
      ).employmentType
    ).toBe("PART_TIME")
    expect(
      JSON.parse(
        jobPostingJsonLd(job({ employment: "contract" }), { siteUrl: jobsSiteUrl, brand: "Acme" })
      ).employmentType
    ).toBe("CONTRACTOR")
  })

  test("hiringOrganization carries the brand", () => {
    const parsed = JSON.parse(jobPostingJsonLd(job(), { siteUrl: jobsSiteUrl, brand: "Acme" }))
    expect(parsed.hiringOrganization).toEqual({ "@type": "Organization", name: "Acme" })
  })

  test("a non-remote location becomes jobLocation, with no applicantLocationRequirements", () => {
    const parsed = JSON.parse(jobPostingJsonLd(job(), { siteUrl: jobsSiteUrl, brand: "Acme" }))
    expect(parsed.jobLocation).toEqual({
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: "Stockholm, Sweden" },
    })
    expect(parsed.applicantLocationRequirements).toBeUndefined()
  })

  test("a 'Remote…' location becomes applicantLocationRequirements, with no jobLocation", () => {
    const parsed = JSON.parse(
      jobPostingJsonLd(job({ location: "Remote (US)" }), { siteUrl: jobsSiteUrl, brand: "Acme" })
    )
    expect(parsed.applicantLocationRequirements).toEqual({
      "@type": "Country",
      name: "Remote (US)",
    })
    expect(parsed.jobLocation).toBeUndefined()
  })

  test("a title containing </script> is escaped so it cannot close the tag", () => {
    const json = jobPostingJsonLd(job({ title: "Why </script> matters" }), {
      siteUrl: jobsSiteUrl,
      brand: "Acme",
    })
    expect(json).not.toContain("</script>")
    expect(json).toContain("\\u003c/script>")
    expect(JSON.parse(json).title).toBe("Why </script> matters")
  })
})
