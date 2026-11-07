import { expect, test } from "bun:test"
import { renderIn } from "@/test-intl"
import { TermsNote } from "./terms-note"

test("links Terms and Privacy on the marketing site, not the auth host", () => {
  const html = renderIn("en", <TermsNote legalBaseUrl="https://www.acme.com" />)
  expect(html).toContain('href="https://www.acme.com/terms"')
  expect(html).toContain('href="https://www.acme.com/privacy"')
})
