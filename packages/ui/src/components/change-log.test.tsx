import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ChangeLog } from "./change-log"

const changes = [
  { date: new Date("2026-12-01"), summary: "Ny avbokningsregel." },
  { date: new Date("2026-11-12"), summary: "Första utkastet." },
]

describe("ChangeLog", () => {
  test("a section named by its heading over an ordered list of dated entries", () => {
    const html = renderToStaticMarkup(
      <ChangeLog changes={changes} dateLocale="sv-SE" labels={{ heading: "Ändringar" }} />
    )
    expect(html).toMatch(/^<section aria-labelledby="changes"/)
    expect(html).toContain('<h2 id="changes"')
    expect(html).toContain(">Ändringar</h2>")
    expect(html).toContain("<ol")
    expect(html.match(/<li/g)).toHaveLength(2)
    expect(html).toContain('<time dateTime="2026-12-01"')
    expect(html).toContain(">1 dec. 2026</time>")
    expect(html).toContain("Ny avbokningsregel.")
  })

  test("keeps the order it is given, newest first", () => {
    const html = renderToStaticMarkup(
      <ChangeLog changes={changes} dateLocale="en-GB" labels={{ heading: "Changes" }} />
    )
    expect(html.indexOf("2026-12-01")).toBeLessThan(html.indexOf("2026-11-12"))
    expect(html).toContain(">12 Nov 2026</time>")
  })

  test("takes another heading id, for a second log on one page", () => {
    const html = renderToStaticMarkup(
      <ChangeLog
        id="history"
        changes={changes}
        dateLocale="en-GB"
        labels={{ heading: "History" }}
      />
    )
    expect(html).toContain('aria-labelledby="history"')
    expect(html).toContain('<h2 id="history"')
  })
})
