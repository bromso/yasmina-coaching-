import { expect, test } from "bun:test"
import { legalUrl } from "@repo/sites/legal"
import { renderIn } from "@/test-intl"
import { TermsNote } from "./terms-note"

test("links the terms and the privacy policy on the legal app, not the auth host", () => {
  const html = renderIn(
    "sv",
    <TermsNote termsHref={legalUrl("terms", "sv")} privacyHref={legalUrl("privacy", "sv")} />
  )
  expect(html).toContain(`href="${legalUrl("terms", "sv")}"`)
  expect(html).toContain(`href="${legalUrl("privacy", "sv")}"`)
})
