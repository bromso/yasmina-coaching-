import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { LEAD_NEEDS, LEAD_TIMELINES, leadNextStep } from "@repo/api-contract/leads"
import { LOCALES } from "@repo/i18n/locales"
import { CONTACT, EXPLORE_POSTS } from "./contact"

const POSTS = join(import.meta.dir, "../../../blog/content/posts")

describe("the contact page's copy", () => {
  test("the explore step's posts exist on the blog, two per language, each in its own language", () => {
    for (const locale of LOCALES) {
      expect(EXPLORE_POSTS[locale]).toHaveLength(2)
      for (const post of EXPLORE_POSTS[locale]) {
        expect(existsSync(join(POSTS, `${post.slug}.mdx`)), post.slug).toBe(true)
        expect(post.slug.startsWith("en-")).toBe(locale === "en")
      }
    }
  })

  test("every answer has a label, and every next step a title, a body and a call to action", () => {
    for (const locale of LOCALES) {
      const { form, done } = CONTACT[locale]
      for (const need of LEAD_NEEDS) expect(form.need.labels[need].length).toBeGreaterThan(0)
      for (const timeline of LEAD_TIMELINES) {
        expect(form.timeline.labels[timeline].length).toBeGreaterThan(0)
      }
      for (const need of LEAD_NEEDS) {
        const { kind } = leadNextStep({ need, timeline: "month", audience: "private" })
        expect(done.next[kind].cta.length).toBeGreaterThan(0)
      }
      expect(form.steps).toHaveLength(4)
      expect(done.whatNow.items).toHaveLength(3)
    }
  })

  test("the promised response time is the same in the hero and the done page", () => {
    expect(CONTACT.sv.hero.response).toBe("Du får svar inom två arbetsdagar.")
    expect(CONTACT.en.hero.response).toBe("You'll hear back within two working days.")
    expect(CONTACT.sv.done.body).toContain("inom två arbetsdagar")
    expect(CONTACT.en.done.body).toContain("within two working days")
  })
})
