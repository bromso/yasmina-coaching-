import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"

// A root loading.tsx wedges apps/account's revalidating server actions: with the boundary present,
// Switch plan, Send invitation and Continue to checkout got their complete response but the
// transition never committed (the button spun until a reload) in 9-11 of 12 e2e iterations,
// whether the page was reached by a sidebar <Link> or a fresh load; without it, 24 of 24 passed.
// The (account) route group between the root layout and the pages does not protect them. Next
// 16.2's client router; apps/app and apps/auth carry the same guard (see their
// root-loading.test.ts). A slow navigation keeps the current page on screen instead of a spinner.
test("apps/account has no root loading.tsx", () => {
  expect(existsSync(join(import.meta.dir, "loading.tsx"))).toBe(false)
})
