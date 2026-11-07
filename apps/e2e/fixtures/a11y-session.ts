import { join } from "node:path"
import { type Browser, type BrowserContext, expect, type Page } from "@playwright/test"
import type { A11yPage, Variant } from "../a11y/routes"
import { TMP, URLS } from "../e2e.env"
import { createWorkspace, ensureAdmin, signUpVerified, uniqueEmail } from "./accounts"

const cache = new Map<string, Promise<string>>()

/**
 * A saved sign-in for `role`, created once per worker: `user` is a verified account with a
 * workspace and one note (so /notes shows real content); `superadmin` is the e2e superadmin. The
 * session cookie is on `.brand.localhost`, so the one state signs in to every app.
 */
export function storageStateFor(browser: Browser, role: "user" | "superadmin"): Promise<string> {
  let state = cache.get(role)
  if (!state) {
    state = (async () => {
      const context = await browser.newContext()
      const page = await context.newPage()
      if (role === "superadmin") {
        await ensureAdmin(page, "admin@e2e.test")
      } else {
        await signUpVerified(page, uniqueEmail("a11y"), "Ada Lovelace")
        await createWorkspace(page, "Accessibility")
        await page.getByLabel("Title", { exact: true }).fill("A note for the accessibility sweep")
        await page
          .getByLabel("Body", { exact: true })
          .fill("Created for the a11y sweep's signed-in fixtures.")
        await page.getByRole("button", { name: "Add note" }).click()
        await expect(page.getByText("A note for the accessibility sweep")).toBeVisible()
      }
      const path = join(TMP, `a11y-${role}.json`)
      await context.storageState({ path })
      await context.close()
      return path
    })()
    cache.set(role, state)
  }
  return state
}

/** Sets the theme and language a variant names before the page is loaded. */
export async function applyVariant(context: BrowserContext, page: Page, variant: Variant) {
  await page.emulateMedia({ colorScheme: variant.endsWith("dark") ? "dark" : "light" })
  if (variant.startsWith("sv")) {
    await context.addCookies([
      { name: "locale", value: "sv", domain: ".brand.localhost", path: "/" },
    ])
  }
}

export const urlFor = (app: keyof typeof URLS, path: string) => `${URLS[app]}${path}`

/**
 * The concrete path for a manifest page: its own `path`, or for an admin detail page (`setup`) the
 * first `/admin/users/<id>` or `/admin/workspaces/<id>` link on its list page. `page` must be
 * signed in as a superadmin for a `setup` entry.
 */
export async function resolvePath(page: Page, entry: A11yPage): Promise<string> {
  if (!entry.setup) return entry.path
  const list = entry.setup === "adminUser" ? "/admin/users" : "/admin/workspaces"
  await page.goto(urlFor("auth", list))
  const link = page.locator(`main a[href^="${list}/"]`).first()
  const href = await link.getAttribute("href")
  if (!href) throw new Error(`no ${list}/<id> link to follow`)
  return href
}
