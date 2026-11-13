import { expect, type Page, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { signUp, uniqueEmail } from "../fixtures/accounts"

// The legal app (`apps/legal`): Swedish at the root, English under `/en`, every page a draft
// awaiting legal review (`LEGAL_DRAFT` unset in the e2e build) and so `noindex`.

const PAGES = [
  {
    sv: { path: "/integritet", title: "Integritet och cookies" },
    en: { path: "/en/privacy", title: "Privacy and cookies" },
  },
  {
    sv: { path: "/villkor", title: "Villkor och bokningsregler" },
    en: { path: "/en/terms", title: "Terms and booking rules" },
  },
  {
    sv: { path: "/tillganglighet", title: "Tillgänglighetsredogörelse" },
    en: { path: "/en/accessibility", title: "Accessibility statement" },
  },
  {
    sv: { path: "/foretaget", title: "Företaget och kontakt" },
    en: { path: "/en/company", title: "Company and contact details" },
  },
] as const

// Each language's chrome: the nav landmark, the draft notice, and the header's link to the other
// language (named in the language it leads to).
const CHROME = {
  sv: {
    lang: "sv",
    nav: "Webbplats",
    draft: "Utkast – granskas juridiskt",
    other: "Read in English",
  },
  en: { lang: "en", nav: "Site", draft: "Draft – under legal review", other: "Läs på svenska" },
} as const

async function expectLegalPage(page: Page, locale: "sv" | "en", title: string) {
  await expect(page.locator("html")).toHaveAttribute("lang", CHROME[locale].lang)
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()
  await expect(page.getByRole("note").filter({ hasText: CHROME[locale].draft })).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)
}

for (const { sv, en } of PAGES) {
  for (const [locale, here, there] of [
    ["sv", sv, en],
    ["en", en, sv],
  ] as const) {
    test(`${here.path}: heading, draft notice, noindex, and the language link`, async ({
      page,
    }) => {
      const res = await page.goto(`${URLS.legal}${here.path}`)
      expect(res?.status()).toBe(200)
      await expectLegalPage(page, locale, here.title)
      await page
        .getByRole("navigation", { name: CHROME[locale].nav })
        .getByRole("link", { name: CHROME[locale].other })
        .click()
      await expect(page).toHaveURL(`${URLS.legal}${there.path}`)
      await expectLegalPage(page, locale === "sv" ? "en" : "sv", there.title)
    })
  }
}

test("the two indexes are drafts too, and robots.txt disallows the app", async ({
  page,
  request,
}) => {
  for (const [path, locale] of [
    ["/", "sv"],
    ["/en", "en"],
  ] as const) {
    await page.goto(`${URLS.legal}${path}`)
    await expect(page.locator("html")).toHaveAttribute("lang", locale)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    await expect(page.getByRole("note").filter({ hasText: CHROME[locale].draft })).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)
  }
  const robots = await request.get(`${URLS.legal}/robots.txt`)
  expect(robots.ok()).toBe(true)
  expect(await robots.text()).toMatch(/Disallow: \/$/m)
})

// www's old paths are 308s that follow the `locale` cookie, sent `Cache-Control: private,
// no-store` so the browser asks again after a language switch (status, target and header are
// pinned in www.spec.ts). Here one browser context follows them all the way to the legal page,
// first in Swedish, then, the cookie changed, in English: a cached 308 would fail the second half.
for (const [path, sv, en] of [
  ["/privacy", PAGES[0].sv, PAGES[0].en],
  ["/terms", PAGES[1].sv, PAGES[1].en],
] as const) {
  test(`www ${path} lands on the legal page in the reader's language`, async ({
    page,
    context,
  }) => {
    await page.goto(`${URLS.www}${path}`)
    await expect(page).toHaveURL(`${URLS.legal}${sv.path}`)
    await expectLegalPage(page, "sv", sv.title)

    await context.addCookies([
      { name: "locale", value: "en", domain: ".brand.localhost", path: "/" },
    ])
    await page.goto(`${URLS.www}${path}`)
    await expect(page).toHaveURL(`${URLS.legal}${en.path}`)
    await expectLegalPage(page, "en", en.title)
  })
}

test("the cookie banner's privacy link on www opens the legal app's privacy page", async ({
  page,
}) => {
  await page.goto(URLS.www)
  const banner = page.getByRole("region", { name: "Samtycke till kakor" })
  await expect(banner).toBeVisible()
  // By href, not by label: the banner's words are the shared `ui` catalog's.
  const link = banner.locator(`a[href="${URLS.legal}/integritet"]`)
  await expect(link).toHaveCount(1)
  await link.click()
  await expect(page).toHaveURL(`${URLS.legal}/integritet`)
  await expectLegalPage(page, "sv", PAGES[0].sv.title)
})

/**
 * The footer's legal line links the legal app's privacy, terms and accessibility pages (www adds
 * its own contact page after them), and every link in it answers 200.
 */
async function expectFooterLegalLinks(page: Page) {
  const links = page.locator('[data-slot="site-footer-legal"] a')
  await expect(links.first()).toBeAttached()
  const hrefs = await links.evaluateAll((anchors) =>
    anchors.map((anchor) => (anchor as HTMLAnchorElement).href)
  )
  expect(hrefs.filter((href) => href.startsWith(`${URLS.legal}/`))).toHaveLength(3)
  for (const href of hrefs) {
    const res = await page.request.get(href)
    expect(res.status(), href).toBe(200)
  }
}

for (const [app, path] of [
  ["www", "/"],
  ["blog", "/"],
  ["auth", "/login"],
] as const) {
  test(`${app}: every footer legal link resolves`, async ({ page }) => {
    await page.goto(`${URLS[app]}${path}`)
    await expectFooterLegalLinks(page)
  })
}

test("account: every footer legal link resolves on a signed-in page", async ({ page }) => {
  await signUp(page, uniqueEmail("legal-footer"))
  await page.goto(URLS.account)
  await expect(page).toHaveURL((url) => url.href.startsWith(`${URLS.account}/`))
  await expectFooterLegalLinks(page)
})
