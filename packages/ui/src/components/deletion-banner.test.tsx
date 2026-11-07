import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { DeletionBanner, formatDeletionText } from "./deletion-banner"

const cancel = async () => {}

describe("DeletionBanner", () => {
  test("says when the account goes, with a cancel button that posts a plain form", () => {
    const html = renderToStaticMarkup(
      <DeletionBanner deletionScheduledAt="2026-10-17T09:00:00.000Z" cancel={cancel} />
    )
    expect(html).toContain('role="status"')
    expect(html).toContain("Your account will be deleted on Oct 17, 2026.")
    expect(html).toMatch(/<form[^>]*>.*<button type="submit"[^>]*>Cancel deletion<\/button>/)
  })

  test("takes its words in the page's language", () => {
    const html = renderToStaticMarkup(
      <DeletionBanner
        deletionScheduledAt="2026-10-17T09:00:00.000Z"
        cancel={cancel}
        text="Ditt konto raderas den 17 okt. 2026."
        labels={{ cancel: "Avbryt raderingen" }}
      />
    )
    expect(html).toContain("Ditt konto raderas den 17 okt. 2026.")
    expect(html).toContain(">Avbryt raderingen</button>")
  })

  test("formatDeletionText is fixed to UTC", () => {
    expect(formatDeletionText("2026-10-17T23:30:00.000Z")).toBe(
      "Your account will be deleted on Oct 17, 2026."
    )
  })
})
