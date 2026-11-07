import { describe, expect, test } from "bun:test"
import { FILE_KEY_PATTERN } from "./files"
import { applicationLink, CV_KEY_PATTERN, JobApplySchema, jobReference } from "./jobs"

const cv = new File([new Uint8Array([1])], "cv.pdf", { type: "application/pdf" })
const valid = {
  job: "senior-engineer",
  title: " Senior Engineer ",
  name: " Ada ",
  email: " Ada@Example.com ",
  cv,
}

describe("jobs schemas", () => {
  test("the email is normalised and the text trimmed", () => {
    expect(JobApplySchema.parse({ ...valid, note: " Hi " })).toEqual({
      job: "senior-engineer",
      title: "Senior Engineer",
      name: "Ada",
      email: "ada@example.com",
      link: undefined,
      note: "Hi",
      cv,
    })
  })

  test("each field's bounds", () => {
    const ok = (patch: Record<string, unknown>) =>
      JobApplySchema.safeParse({ ...valid, ...patch }).success
    expect(ok({ job: "Senior" })).toBe(false)
    expect(ok({ job: "a/b" })).toBe(false)
    expect(ok({ job: "x".repeat(101) })).toBe(false)
    expect(ok({ job: "x".repeat(100) })).toBe(true)
    expect(ok({ title: " " })).toBe(false)
    expect(ok({ title: "x".repeat(201) })).toBe(false)
    expect(ok({ title: "x".repeat(200) })).toBe(true)
    expect(ok({ name: "" })).toBe(false)
    expect(ok({ name: "x".repeat(101) })).toBe(false)
    expect(ok({ name: "x".repeat(100) })).toBe(true)
    expect(ok({ email: "nope" })).toBe(false)
    expect(ok({ note: "x".repeat(3001) })).toBe(false)
    expect(ok({ note: "x".repeat(3000) })).toBe(true)
    expect(ok({ cv: "not a file" })).toBe(false)
  })

  test("a link that is not https:// of at most 300 characters is dropped, not refused", () => {
    const linkOf = (link: unknown) => JobApplySchema.parse({ ...valid, link }).link
    expect(linkOf("https://example.com/me")).toBe("https://example.com/me")
    expect(linkOf("http://example.com")).toBeUndefined()
    expect(linkOf("javascript:alert(1)")).toBeUndefined()
    expect(linkOf(`https://example.com/${"a".repeat(300)}`)).toBeUndefined()
    expect(linkOf(42)).toBeUndefined()
    expect(applicationLink(" https://x.example ")).toBe("https://x.example")
    expect(applicationLink("https://")).toBeNull()
  })

  test("jobReference", () => expect(jobReference(7)).toBe("JOB-7"))

  test("CV keys and file keys never overlap", () => {
    const key = "applications/AAAAAAAAAAAAAAAAAAAAAA.pdf"
    expect(CV_KEY_PATTERN.test(key)).toBe(true)
    expect(FILE_KEY_PATTERN.test(key)).toBe(false)
    expect(CV_KEY_PATTERN.test("avatars/1/AAAAAAAAAAAAAAAAAAAAAA.png")).toBe(false)
    expect(CV_KEY_PATTERN.test("applications/../AAAAAAAAAAAAAAAAAAAA.pdf")).toBe(false)
  })
})
