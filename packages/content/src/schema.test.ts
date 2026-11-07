import { describe, expect, test } from "bun:test"
import {
  docFrontmatterSchema,
  helpFrontmatterSchema,
  jobFrontmatterSchema,
  postFrontmatterSchema,
  SLUG_PATTERN,
  TAG_PATTERN,
} from "./schema"

const valid = {
  title: "Hello world",
  description: "A short description",
  date: "2026-01-02",
  author: "jane",
  tags: ["next-js", "bun"],
}

describe("TAG_PATTERN / SLUG_PATTERN", () => {
  test("lowercase kebab-case matches", () => {
    expect(TAG_PATTERN.test("next-js")).toBe(true)
    expect(SLUG_PATTERN.test("my-post")).toBe(true)
  })
  test("uppercase, spaces or dots are refused", () => {
    expect(TAG_PATTERN.test("Next.js")).toBe(false)
    expect(SLUG_PATTERN.test("My Post")).toBe(false)
  })
})

describe("postFrontmatterSchema", () => {
  test("a valid frontmatter parses; dates become Date; type defaults to Blog Post", () => {
    const result = postFrontmatterSchema.parse(valid)
    expect(result.date).toBeInstanceOf(Date)
    expect(result.date.toISOString().slice(0, 10)).toBe("2026-01-02")
    expect(result.type).toBe("Blog Post")
  })

  test("an explicit type is kept", () => {
    const result = postFrontmatterSchema.parse({ ...valid, type: "Article" })
    expect(result.type).toBe("Article")
  })

  test("type: '' is refused", () => {
    expect(() => postFrontmatterSchema.parse({ ...valid, type: "" })).toThrow()
  })

  test("a bad date is refused", () => {
    expect(() => postFrontmatterSchema.parse({ ...valid, date: "not-a-date" })).toThrow()
  })

  test("date: null is refused (an empty YAML date:)", () => {
    expect(() => postFrontmatterSchema.parse({ ...valid, date: null })).toThrow()
  })

  test('date: "" is refused', () => {
    expect(() => postFrontmatterSchema.parse({ ...valid, date: "" })).toThrow()
  })

  test("date: 0 is refused (a number, not a date string)", () => {
    expect(() => postFrontmatterSchema.parse({ ...valid, date: 0 })).toThrow()
  })

  test("a missing title is refused", () => {
    const { title, ...rest } = valid
    expect(() => postFrontmatterSchema.parse(rest)).toThrow()
  })

  test("an unknown extra key is refused (strict)", () => {
    expect(() => postFrontmatterSchema.parse({ ...valid, extra: "nope" })).toThrow()
  })

  test("cover without alt is refused", () => {
    expect(() => postFrontmatterSchema.parse({ ...valid, cover: { src: "/cover.png" } })).toThrow()
  })

  test("cover with alt is kept", () => {
    const result = postFrontmatterSchema.parse({
      ...valid,
      cover: { src: "/cover.png", alt: "A cover" },
    })
    expect(result.cover).toEqual({ src: "/cover.png", alt: "A cover" })
  })

  test("updated becomes a Date when present", () => {
    const result = postFrontmatterSchema.parse({ ...valid, updated: "2026-01-05" })
    expect(result.updated).toBeInstanceOf(Date)
  })

  test("draft is kept as a boolean", () => {
    const result = postFrontmatterSchema.parse({ ...valid, draft: true })
    expect(result.draft).toBe(true)
  })
})

describe("docFrontmatterSchema", () => {
  const validDoc = { title: "Getting started", description: "A short description" }

  test("a doc with only title and description parses; type defaults to Documentation", () => {
    const result = docFrontmatterSchema.parse(validDoc)
    expect(result.type).toBe("Documentation")
  })

  test("tags default to an empty list, like a post's", () => {
    expect(docFrontmatterSchema.parse(validDoc).tags).toEqual([])
  })

  test("a missing description is refused", () => {
    const { description, ...rest } = validDoc
    expect(() => docFrontmatterSchema.parse(rest)).toThrow()
  })

  test("an unknown key is refused (strict)", () => {
    expect(() => docFrontmatterSchema.parse({ ...validDoc, extra: "nope" })).toThrow()
  })

  test("updated: '' is refused", () => {
    expect(() => docFrontmatterSchema.parse({ ...validDoc, updated: "" })).toThrow()
  })

  test("updated: null is refused", () => {
    expect(() => docFrontmatterSchema.parse({ ...validDoc, updated: null })).toThrow()
  })

  test("updated becomes a Date when present", () => {
    const result = docFrontmatterSchema.parse({ ...validDoc, updated: "2026-01-05" })
    expect(result.updated).toBeInstanceOf(Date)
  })

  test("tag Next.js is refused", () => {
    expect(() => docFrontmatterSchema.parse({ ...validDoc, tags: ["Next.js"] })).toThrow()
  })

  test("lowercase kebab-case tags are kept", () => {
    const result = docFrontmatterSchema.parse({ ...validDoc, tags: ["next-js", "bun"] })
    expect(result.tags).toEqual(["next-js", "bun"])
  })

  test("icon is kept", () => {
    const result = docFrontmatterSchema.parse({ ...validDoc, icon: "rocket" })
    expect(result.icon).toBe("rocket")
  })

  test("an explicit type is kept", () => {
    const result = docFrontmatterSchema.parse({ ...validDoc, type: "Guide" })
    expect(result.type).toBe("Guide")
  })
})

describe("helpFrontmatterSchema", () => {
  const validHelp = { title: "Create an account", description: "A short description" }

  test("a help article with only title and description parses; type defaults to Help Article", () => {
    const result = helpFrontmatterSchema.parse(validHelp)
    expect(result.type).toBe("Help Article")
  })

  test("tags default to an empty list; popular is left undefined", () => {
    const result = helpFrontmatterSchema.parse(validHelp)
    expect(result.tags).toEqual([])
    expect(result.popular).toBeUndefined()
  })

  test("a missing description is refused", () => {
    const { description, ...rest } = validHelp
    expect(() => helpFrontmatterSchema.parse(rest)).toThrow()
  })

  test("an unknown key is refused (strict)", () => {
    expect(() => helpFrontmatterSchema.parse({ ...validHelp, extra: "nope" })).toThrow()
  })

  test("updated: '' is refused", () => {
    expect(() => helpFrontmatterSchema.parse({ ...validHelp, updated: "" })).toThrow()
  })

  test("updated: null is refused", () => {
    expect(() => helpFrontmatterSchema.parse({ ...validHelp, updated: null })).toThrow()
  })

  test("updated becomes a Date when present", () => {
    const result = helpFrontmatterSchema.parse({ ...validHelp, updated: "2026-01-05" })
    expect(result.updated).toBeInstanceOf(Date)
  })

  test("tag Next.js is refused", () => {
    expect(() => helpFrontmatterSchema.parse({ ...validHelp, tags: ["Next.js"] })).toThrow()
  })

  test("lowercase kebab-case tags are kept", () => {
    const result = helpFrontmatterSchema.parse({ ...validHelp, tags: ["two-factor", "billing"] })
    expect(result.tags).toEqual(["two-factor", "billing"])
  })

  test("popular: true is kept", () => {
    expect(helpFrontmatterSchema.parse({ ...validHelp, popular: true }).popular).toBe(true)
  })

  test("an explicit type is kept", () => {
    const result = helpFrontmatterSchema.parse({ ...validHelp, type: "FAQ" })
    expect(result.type).toBe("FAQ")
  })
})

describe("jobFrontmatterSchema", () => {
  const validJob = {
    title: "Senior Full-stack Engineer",
    description: "Build the product end to end.",
    team: "Engineering",
    location: "Remote (US)",
    employment: "full-time",
    posted: "2026-01-02",
  }

  test("a valid job parses; posted becomes a YYYY-MM-DD string; status defaults to open", () => {
    const result = jobFrontmatterSchema.parse(validJob)
    expect(result.posted).toBe("2026-01-02")
    expect(result.status).toBe("open")
  })

  test("kind defaults to Job Posting", () => {
    expect(jobFrontmatterSchema.parse(validJob).kind).toBe("Job Posting")
  })

  test("an explicit kind is kept", () => {
    expect(jobFrontmatterSchema.parse({ ...validJob, kind: "Posting" }).kind).toBe("Posting")
  })

  test("closes becomes a YYYY-MM-DD string when present", () => {
    const result = jobFrontmatterSchema.parse({ ...validJob, closes: "2026-02-01" })
    expect(result.closes).toBe("2026-02-01")
  })

  test("closes is left undefined when absent", () => {
    expect(jobFrontmatterSchema.parse(validJob).closes).toBeUndefined()
  })

  test("a status of closed is kept", () => {
    expect(jobFrontmatterSchema.parse({ ...validJob, status: "closed" }).status).toBe("closed")
  })

  test("an unknown status is refused", () => {
    expect(() => jobFrontmatterSchema.parse({ ...validJob, status: "paused" })).toThrow()
  })

  test("employment accepts full-time, part-time and contract only", () => {
    expect(jobFrontmatterSchema.parse({ ...validJob, employment: "contract" }).employment).toBe(
      "contract"
    )
    expect(() => jobFrontmatterSchema.parse({ ...validJob, employment: "intern" })).toThrow()
  })

  test("salary is optional and kept as free text when present", () => {
    expect(jobFrontmatterSchema.parse(validJob).salary).toBeUndefined()
    expect(jobFrontmatterSchema.parse({ ...validJob, salary: "$120k-$150k" }).salary).toBe(
      "$120k-$150k"
    )
  })

  test("a missing required field is refused", () => {
    const { team, ...rest } = validJob
    expect(() => jobFrontmatterSchema.parse(rest)).toThrow()
  })

  test("an unknown extra key is refused (strict)", () => {
    expect(() => jobFrontmatterSchema.parse({ ...validJob, extra: "nope" })).toThrow()
  })

  test("a bad posted date is refused", () => {
    expect(() => jobFrontmatterSchema.parse({ ...validJob, posted: "not-a-date" })).toThrow()
  })

  test("posted: null is refused (an empty YAML date:)", () => {
    expect(() => jobFrontmatterSchema.parse({ ...validJob, posted: null })).toThrow()
  })

  test("a Date value for posted is accepted and normalised to UTC YYYY-MM-DD", () => {
    const result = jobFrontmatterSchema.parse({
      ...validJob,
      posted: new Date("2026-03-04T00:00:00Z"),
    })
    expect(result.posted).toBe("2026-03-04")
  })
})
