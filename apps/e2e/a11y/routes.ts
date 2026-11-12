// Every page the accessibility sweep visits (tests/a11y-pages.spec.ts), as plain data: the planner
// test scripts/a11y.test.ts imports it before `bun install`, so no Playwright import here. A new
// page.tsx in one of the nine Next apps fails that test until it is listed here or in EXCLUDED.

export type AppId = "www" | "app" | "auth" | "account" | "docs" | "help" | "jobs" | "blog" | "legal"
export type Variant = "light" | "dark" | "sv-light" | "sv-dark" | "en-light" | "en-dark"

export type A11yPage = {
  app: AppId
  /** The concrete path visited (with any query string). */
  path: string
  /** The Next route pattern it covers; defaults to `path` without its query. */
  route?: string
  auth: "none" | "user" | "superadmin"
  /** Overrides `variantsFor`'s default. */
  variants?: Variant[]
  /** A page whose path is only known at run time (an id), resolved by the sweep. */
  setup?: "adminUser" | "adminWorkspace" | "adminBooking" | "adminLead"
}

const APPS: AppId[] = ["www", "app", "auth", "account", "docs", "help", "jobs", "blog", "legal"]
const TRANSLATED: AppId[] = ["auth", "app", "account"]

const notFound = (app: AppId, auth: A11yPage["auth"] = "none"): A11yPage => ({
  app,
  path: "/__a11y-not-found",
  route: "404",
  auth,
})

export const A11Y_PAGES: A11yPage[] = [
  // www (Swedish by default; the landing page is also checked in English, the `locale` cookie set)
  { app: "www", path: "/", auth: "none", variants: ["light", "dark", "en-light", "en-dark"] },
  // Ledarskap inifrån: the hub (also in English), the four services (one route) and the research.
  {
    app: "www",
    path: "/inifran",
    auth: "none",
    variants: ["light", "dark", "en-light"],
  },
  { app: "www", path: "/inifran/coachning", route: "/inifran/[service]", auth: "none" },
  { app: "www", path: "/inifran/mentorskap", route: "/inifran/[service]", auth: "none" },
  { app: "www", path: "/inifran/livsstil", route: "/inifran/[service]", auth: "none" },
  { app: "www", path: "/inifran/grupp", route: "/inifran/[service]", auth: "none" },
  { app: "www", path: "/inifran/forskning", auth: "none" },
  // The booking journey: the catalog, one page per kind of offering (the same route), the
  // confirmation. The token manage page is excluded below.
  { app: "www", path: "/book", auth: "none" },
  { app: "www", path: "/book?for=organisation", route: "/book", auth: "none" },
  { app: "www", path: "/book/session", route: "/book/[offering]", auth: "none" },
  { app: "www", path: "/book/package_6", route: "/book/[offering]", auth: "none" },
  { app: "www", path: "/book/group", route: "/book/[offering]", auth: "none" },
  { app: "www", path: "/book/inner_start_coaching", route: "/book/[offering]", auth: "none" },
  { app: "www", path: "/book/inner_group", route: "/book/[offering]", auth: "none" },
  { app: "www", path: "/book/workshop", route: "/book/[offering]", auth: "none" },
  { app: "www", path: "/book/done?ref=BK-1&kind=request", auth: "none" },
  // The contact form (also in English) and its done page with the explore step (the longest).
  { app: "www", path: "/kontakt", auth: "none", variants: ["light", "dark", "en-light"] },
  {
    app: "www",
    path: "/kontakt/tack?ref=LEAD-1&for=private&need=unsure&when=exploring",
    route: "/kontakt/tack",
    auth: "none",
  },
  notFound("www"),
  // app (signed in, with a workspace and a note)
  { app: "app", path: "/", auth: "user" },
  { app: "app", path: "/notes", auth: "user" },
  { app: "app", path: "/chat", auth: "user" },
  { app: "app", path: "/workspaces/new", auth: "user" },
  {
    app: "app",
    path: "/invitations/a11y-not-a-real-token",
    route: "/invitations/[token]",
    auth: "user",
  },
  notFound("app", "user"),
  // auth (signed out)
  { app: "auth", path: "/login", auth: "none" },
  { app: "auth", path: "/signup", auth: "none" },
  { app: "auth", path: "/forgot-password", auth: "none" },
  { app: "auth", path: "/magic?token=a11y-not-a-real-token", auth: "none" },
  { app: "auth", path: "/reset-password?token=a11y-not-a-real-token", auth: "none" },
  { app: "auth", path: "/verify-email?token=a11y-not-a-real-token", auth: "none" },
  // Never consumed on load (a button-only cancel/revert, like /magic): a fake token renders the
  // same page a real one would.
  { app: "auth", path: "/email/cancel?token=a11y-not-a-real-token", auth: "none" },
  { app: "auth", path: "/email/revert?token=a11y-not-a-real-token", auth: "none" },
  // Never acted on load either (only a read-only `peek`): a fake token renders the page's neutral
  // "isn't valid any more" state; the confirm state needs a real token, minted by a journey.
  { app: "auth", path: "/email/unsubscribe?token=a11y-not-a-real-token", auth: "none" },
  notFound("auth"),
  // auth admin (English on purpose: no Swedish variants)
  { app: "auth", path: "/admin", auth: "superadmin" },
  { app: "auth", path: "/admin/users", auth: "superadmin" },
  { app: "auth", path: "/admin/users/[id]", auth: "superadmin", setup: "adminUser" },
  { app: "auth", path: "/admin/workspaces", auth: "superadmin" },
  { app: "auth", path: "/admin/workspaces/[id]", auth: "superadmin", setup: "adminWorkspace" },
  { app: "auth", path: "/admin/audit", auth: "superadmin" },
  { app: "auth", path: "/admin/analytics", auth: "superadmin" },
  { app: "auth", path: "/admin/support", auth: "superadmin" },
  { app: "auth", path: "/admin/applications", auth: "superadmin" },
  { app: "auth", path: "/admin/bookings", auth: "superadmin" },
  { app: "auth", path: "/admin/bookings/[id]", auth: "superadmin", setup: "adminBooking" },
  { app: "auth", path: "/admin/bookings/availability", auth: "superadmin" },
  { app: "auth", path: "/admin/bookings/groups", auth: "superadmin" },
  { app: "auth", path: "/admin/leads", auth: "superadmin" },
  { app: "auth", path: "/admin/leads/[id]", auth: "superadmin", setup: "adminLead" },
  // account (signed in)
  { app: "account", path: "/", auth: "user" },
  { app: "account", path: "/personal-info", auth: "user" },
  { app: "account", path: "/security", auth: "user" },
  { app: "account", path: "/workspace", auth: "user" },
  { app: "account", path: "/payments", auth: "user" },
  { app: "account", path: "/data-privacy", auth: "user" },
  { app: "account", path: "/notifications", auth: "user" },
  // Never consumed on load (a button-only confirm, like auth's /magic): a fake token renders
  // the same page a real one would.
  {
    app: "account",
    path: "/email/confirm?token=a11y-not-a-real-token",
    auth: "user",
  },
  notFound("account", "user"),
  // docs
  { app: "docs", path: "/", route: "/[[...slug]]", auth: "none" },
  { app: "docs", path: "/getting-started", route: "/[[...slug]]", auth: "none" },
  { app: "docs", path: "/all", auth: "none" },
  // The Developers section: the overview, a generated reference page (a schema table) and a
  // generated webhook event page (another schema table plus the "verify the signature first"
  // callout) — the shapes the other docs pages above don't exercise.
  { app: "docs", path: "/developers", route: "/[[...slug]]", auth: "none" },
  {
    app: "docs",
    path: "/developers/reference/create-note",
    route: "/[[...slug]]",
    auth: "none",
  },
  {
    app: "docs",
    path: "/developers/webhooks/events/note-created",
    route: "/[[...slug]]",
    auth: "none",
  },
  notFound("docs"),
  // help
  { app: "help", path: "/", auth: "none" },
  { app: "help", path: "/getting-started", route: "/[category]", auth: "none" },
  {
    app: "help",
    path: "/getting-started/create-an-account",
    route: "/[category]/[article]",
    auth: "none",
  },
  { app: "help", path: "/all", auth: "none" },
  { app: "help", path: "/contact", auth: "none" },
  notFound("help"),
  // jobs (one open role, one closed role, the open role's apply page)
  { app: "jobs", path: "/", auth: "none" },
  { app: "jobs", path: "/senior-fullstack-engineer", route: "/[slug]", auth: "none" },
  { app: "jobs", path: "/customer-support-specialist", route: "/[slug]", auth: "none" },
  { app: "jobs", path: "/senior-fullstack-engineer/apply", route: "/[slug]/apply", auth: "none" },
  notFound("jobs"),
  // blog (Swedish at the root, English under /en: one post and its translation, a tag, the author)
  { app: "blog", path: "/", auth: "none" },
  { app: "blog", path: "/en", auth: "none" },
  { app: "blog", path: "/att-leda-genom-en-kris", route: "/[slug]", auth: "none" },
  { app: "blog", path: "/en/leading-through-a-crisis", route: "/en/[slug]", auth: "none" },
  { app: "blog", path: "/tags/kris", route: "/tags/[tag]", auth: "none" },
  { app: "blog", path: "/en/tags/crisis", route: "/en/tags/[tag]", auth: "none" },
  { app: "blog", path: "/authors/yasmina", route: "/authors/[author]", auth: "none" },
  { app: "blog", path: "/en/authors/yasmina", route: "/en/authors/[author]", auth: "none" },
  notFound("blog"),
  // legal (Swedish at the root, English under /en: both indexes and all four pages in each)
  { app: "legal", path: "/", auth: "none" },
  { app: "legal", path: "/en", auth: "none" },
  { app: "legal", path: "/integritet", route: "/[slug]", auth: "none" },
  { app: "legal", path: "/villkor", route: "/[slug]", auth: "none" },
  { app: "legal", path: "/tillganglighet", route: "/[slug]", auth: "none" },
  { app: "legal", path: "/foretaget", route: "/[slug]", auth: "none" },
  { app: "legal", path: "/en/privacy", route: "/en/[slug]", auth: "none" },
  { app: "legal", path: "/en/terms", route: "/en/[slug]", auth: "none" },
  { app: "legal", path: "/en/accessibility", route: "/en/[slug]", auth: "none" },
  { app: "legal", path: "/en/company", route: "/en/[slug]", auth: "none" },
  notFound("legal"),
]

export const EXCLUDED: Array<{ app: AppId; route: string; reason: string }> = [
  {
    app: "auth",
    route: "/",
    reason: "redirect only",
  },
  {
    app: "auth",
    route: "/login/verify",
    reason:
      "renders only with a live two-step challenge cookie; checked as a state in two-factor.spec",
  },
  {
    app: "auth",
    route: "/admin/stop",
    reason: "renders only while impersonating; checked as a state in admin.spec",
  },
  {
    app: "www",
    route: "/privacy",
    reason: "redirect only, to the legal app's privacy page (checked there); www.spec follows it",
  },
  {
    app: "www",
    route: "/terms",
    reason: "redirect only, to the legal app's terms page (checked there); www.spec follows it",
  },
  {
    app: "www",
    route: "/book/manage/[token]",
    reason: "renders only behind a real manage token from a booking; checked in booking.spec",
  },
  {
    app: "blog",
    route: "/page/[n]",
    reason: "built only past 12 posts in a language (dynamicParams false)",
  },
  {
    app: "blog",
    route: "/en/page/[n]",
    reason: "built only past 12 posts in a language (dynamicParams false)",
  },
]

/** The variants a page is checked in: both themes, plus Swedish on translated non-admin pages. */
export function variantsFor(page: A11yPage): Variant[] {
  if (page.variants) return page.variants
  const translated = TRANSLATED.includes(page.app) && !page.path.startsWith("/admin")
  return translated ? ["light", "dark", "sv-light", "sv-dark"] : ["light", "dark"]
}

const routeKey = (page: A11yPage) => page.route ?? page.path.split("?")[0] ?? page.path

// `apps/<app>/src/app/<…>/page.tsx` → the app and its route pattern; null outside the nine apps.
export function routeOf(file: string): { app: AppId; route: string } | null {
  const match = file.match(/^apps\/([^/]+)\/src\/app\/(.*?)\/?page\.tsx$/)
  if (!match) return null
  const app = match[1] as AppId
  if (!APPS.includes(app)) return null
  const segments = (match[2] ?? "").split("/").filter((s) => s && !/^\(.*\)$/.test(s))
  return { app, route: `/${segments.join("/")}` }
}

/** `"<app> <route>"` for every page file neither the manifest nor EXCLUDED covers. */
export function uncovered(files: string[]): string[] {
  const covered = new Set([
    ...A11Y_PAGES.map((p) => `${p.app} ${routeKey(p)}`),
    ...EXCLUDED.map((e) => `${e.app} ${e.route}`),
  ])
  return files
    .map(routeOf)
    .filter((r): r is { app: AppId; route: string } => r !== null)
    .map((r) => `${r.app} ${r.route}`)
    .filter((key) => !covered.has(key))
    .sort()
}
