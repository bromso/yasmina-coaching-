import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"

// Every apps/app page is a direct child of the root layout, so a root loading.tsx puts the
// loading boundary right above the segment that every soft navigation (<Link>, an action's
// redirect()) swaps out. On a page reached that way, the next server action that revalidates
// (adding a note: revalidatePath("/notes")) gets its response but its transition never commits:
// the form stays on "Saving…" until a reload. Next 16.2's client router, reproduced in
// apps/e2e/tests/notes.spec.ts; a fresh load (no prior soft navigation into the page) passed 6/6
// — only the soft navigation triggers it. A slow navigation now keeps the current page on screen
// until the next one is ready, instead of a spinner. apps/auth has the same hazardous shape and
// the identical guard: see its own root-loading.test.ts.
test("apps/app has no root loading.tsx", () => {
  expect(existsSync(join(import.meta.dir, "loading.tsx"))).toBe(false)
})
