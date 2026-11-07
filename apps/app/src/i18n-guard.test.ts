import { expect, test } from "bun:test"
import { join } from "node:path"
import { describeViolations, scanApp } from "@repo/i18n-guard"

/**
 * apps/app's hard-coded-string guard (i18n): `@repo/i18n-guard`'s `scanApp` over `src/**\/*.tsx`.
 * Excluded on purpose: every test, and `global-error.tsx` (its English fallback is by design: it
 * renders outside the layout's `NextIntlClientProvider`, so `useTranslations` would throw there).
 */
export function isExcluded(rel: string): boolean {
  if (rel.endsWith(".test.tsx") || rel.endsWith(".test.ts")) return true
  return rel === "app/global-error.tsx"
}

test("apps/app's translated surface has no hard-coded, user-facing JSX text", () => {
  const violations = scanApp({
    srcDir: import.meta.dir,
    label: "apps/app/src",
    allowlistPath: join(import.meta.dir, "..", "i18n-guard.allowlist.json"),
    isExcluded,
  })
  if (violations.length > 0) {
    throw new Error(describeViolations(violations, "apps/app/i18n-guard.allowlist.json"))
  }
  expect(violations).toEqual([])
})
