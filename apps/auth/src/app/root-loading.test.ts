import { expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { join } from "node:path"

// Every apps/auth page (login, signup, ...) is a direct child of the root layout, so a root
// loading.tsx puts the loading boundary right above the segment that every soft navigation
// (<Link>, an action's redirect()) swaps out. On a page reached that way, the next server action
// that revalidates (switchWorkspace in src/app/actions.ts calls revalidatePath("/", "layout"))
// can leave its transition uncommitted forever: Next 16.2's client router, reproduced for
// apps/app in apps/e2e/tests/notes.spec.ts and documented in apps/app/src/app/root-loading.test.ts
// — a fresh load there (no prior soft navigation) passed 6/6; only the soft navigation triggers it.
// A slow navigation now keeps the current page on screen until the next one is ready, instead of
// a spinner.
test("apps/auth has no root loading.tsx", () => {
  expect(existsSync(join(import.meta.dir, "loading.tsx"))).toBe(false)
})
