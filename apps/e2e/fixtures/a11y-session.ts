import { join } from "node:path"
import { type Browser, type BrowserContext, expect, type Page } from "@playwright/test"
import type { A11yPage, Variant } from "../a11y/routes"
import { shared, TMP, URLS } from "../e2e.env"
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
  const locale = variant.startsWith("sv") ? "sv" : variant.startsWith("en") ? "en" : null
  if (locale) {
    await context.addCookies([
      { name: "locale", value: locale, domain: ".brand.localhost", path: "/" },
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
  if (entry.setup === "adminBooking") return resolveBookingPath(page)
  if (entry.setup === "adminLead") return resolveLeadPath(page)
  const list = entry.setup === "adminUser" ? "/admin/users" : "/admin/workspaces"
  await page.goto(urlFor("auth", list))
  const link = page.locator(`main a[href^="${list}/"]`).first()
  const href = await link.getAttribute("href")
  if (!href) throw new Error(`no ${list}/<id> link to follow`)
  return href
}

/**
 * `/admin/bookings/<id>` for a request this fixture sends through the api's REST surface (the same
 * call the www request form makes), so the pending list on `/admin/bookings` has a link to follow.
 */
async function resolveBookingPath(page: Page): Promise<string> {
  const response = await page.request.post(`${URLS.api}/openapi/booking/request`, {
    headers: {
      authorization: `Bearer ${shared.API_SERVICE_TOKEN}`,
      "x-api-client-id": "a11y-sweep",
    },
    data: {
      offering: "workshop",
      customer: {
        name: "Ada Lovelace",
        email: uniqueEmail("a11y-booking"),
        organisation: "Accessibility AB",
      },
      location: "on_site",
      preferredDates: [{ date: "2099-03-02", part: "morning" }],
      message: "A request the accessibility sweep made, to render the detail page.",
      termsAccepted: true,
    },
  })
  if (!response.ok()) throw new Error(`booking.request failed: ${response.status()}`)
  await page.goto(urlFor("auth", "/admin/bookings"))
  const hrefs = await page
    .locator('main a[href^="/admin/bookings/"]')
    .evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""))
  const href = hrefs.find((h) => /^\/admin\/bookings\/\d+$/.test(h))
  if (!href) throw new Error("no /admin/bookings/<id> link to follow")
  return href
}

/**
 * `/admin/leads/<id>` for a contact request this fixture sends through the api's REST surface (the
 * same call the www contact form makes), so `/admin/leads` has a link to follow.
 */
async function resolveLeadPath(page: Page): Promise<string> {
  const response = await page.request.post(`${URLS.api}/openapi/leads`, {
    headers: {
      authorization: `Bearer ${shared.API_SERVICE_TOKEN}`,
      "x-api-client-id": "a11y-sweep",
    },
    data: {
      audience: "organisation",
      need: "team",
      timeline: "quarter",
      message: "A request the accessibility sweep made, to render the detail page.",
      name: "Ada Lovelace",
      email: uniqueEmail("a11y-lead"),
      phone: "070-123 45 67",
      organisation: "Accessibility AB",
      role: "Head of unit",
      contactMethod: "phone",
      consent: true,
    },
  })
  if (!response.ok()) throw new Error(`leads.create failed: ${response.status()}`)
  await page.goto(urlFor("auth", "/admin/leads"))
  const hrefs = await page
    .locator('main a[href^="/admin/leads/"]')
    .evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""))
  const href = hrefs.find((h) => /^\/admin\/leads\/\d+$/.test(h))
  if (!href) throw new Error("no /admin/leads/<id> link to follow")
  return href
}
