# Marketing kit: landing blocks, legal pages, waitlist, consent, OG images (Phase 6c)

**Status:** implemented (2026-10-02)
**Date:** 2026-10-02
**Origin:** `docs/superpowers/research/2026-10-01-boilerplate-benchmark.md`, Phase 6 — sub-project 6c
**Builds on:** Phase 5a (`@repo/sites`, `SiteHeader`/`SiteFooter`, `container`), 6a (`@repo/email`,
`detach()`), Phase 4 (`@repo/session`'s api client, `form-feedback`)

## Intent

`packages/ui` has one landing block (`Hero`); `apps/www` is a one-hero shell whose footer links to
`/terms` and `/privacy` that 404; every app's `sitemap.ts` lists one hard-coded `brand.com` URL; no
app has an OG image, a consent banner or a way to capture interest. Seven of the nine benchmarked
kits ship landing blocks and legal pages; this phase closes that gap in the repo's own shape:
content-agnostic blocks in `packages/ui` with stories, one real demo landing page on `www` driven
by a single content file, a waitlist backed by the api, legal template pages, cookie consent that
later analytics can honour, and OG images + real sitemaps for every app.

**Success criteria**

- Eight blocks (`LogoCloud`, `FeatureGrid`, `Testimonials`, `Pricing`, `Faq`, `Cta`, `Newsletter`,
  `LegalPage`) plus `SectionHeading` and `CookieConsent` exist in `packages/ui` with tests and
  stories; a block never fetches or imports a view.
- `www`'s home is a complete landing page composed from them, all copy in `src/content/home.ts`;
  every www route is still statically rendered.
- The waitlist form works without JavaScript: `waitlist.join` in `apps/api`, deduped, rate-limited,
  with a courtesy mail; the response never reveals whether an email was already listed.
- `/terms` and `/privacy` render structured template content with placeholders and a visible
  "template, not legal advice" notice.
- Every app has an OG image route, a sitemap of its real public routes and a robots file, all built
  from `@repo/sites`; `SITE_DOMAIN=example.com` bakes `https://` everywhere.
- The consent banner shows once per browser and stores `consent` on the parent domain; nothing is
  gated yet, and the hook point for analytics is documented.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| www scope | Full demo landing page from one content file | It is the first thing a buyer looks at and the live test of the blocks |
| Legal content | Structured template arrays rendered by `LegalPage` | No MDX pipeline; renaming stays a one-file edit; placeholders are explicit |
| Waitlist backend | `apps/api` table + public procedure; www calls it through a server action with the service token | Keeps the "every api call carries the service token" model; pages stay static; works without JS |
| Dedupe disclosure | Same success response for new and repeated emails | No enumeration of the list |
| Opt-in | Single opt-in + courtesy mail | The list is interest capture, not marketing consent; the form says so |
| Consent storage | Cookie `consent=all\|necessary` on `COOKIE_DOMAIN`, 180 days | Shared across subdomains; readable server-side; no third-party CMP |
| Consent gating | None in this phase; `WebVitals` gains a `consent` prop it will honour later | Analytics destination is a Phase 5 item |
| OG rendering | `next/og` `ImageResponse` via one shared `ogImage()` in `@repo/ui/lib/og` | Per-app route is five lines; one look for every app |
| Sitemap source | Per-app `src/lib/routes.ts` + `siteUrl()` | Explicit public-route list; no accidental listing of auth-only pages |
| Pricing | Static tiers, no monthly/yearly toggle | YAGNI; the toggle is a later feature |

## Components

### `packages/ui`

Blocks (`src/blocks/*.tsx`, kebab-case files, PascalCase exports, `cn()` for `className`, plain
`<a>` links, each a `<section>` with optional `id`):

| Block | Props |
|---|---|
| `SectionHeading` (`src/components/section-heading.tsx`) | `eyebrow?`, `title`, `description?`, `align?: "center" \| "start"` |
| `LogoCloud` | `title?`, `logos: { name: string; src?: string; node?: ReactNode }[]` — `src` renders `<img alt={name}>`, `node` renders inline (aria-hidden with a visually hidden name) |
| `FeatureGrid` | `heading: SectionHeadingProps`, `features: { icon?: ReactNode; title: string; description: string }[]`, `columns?: 2 \| 3 \| 4` (default 3) |
| `Testimonials` | `heading?`, `items: { quote: string; name: string; role?: string; avatar?: { src?: string; initials: string } }[]` — `<figure><blockquote/><figcaption/></figure>` |
| `Pricing` | `heading`, `tiers: { name; price: string; period?: string; description?: string; features: string[]; cta: { label: string; href: string }; highlighted?: boolean }[]`, `note?: ReactNode` — highlighted tier gets a ring and a "Most popular" badge; each CTA's accessible name includes the tier ("Start with Pro") |
| `Faq` | `heading`, `items: { question: string; answer: ReactNode }[]`, `jsonLd?: boolean` — `Accordion` from `@repo/ui/components/accordion`; `jsonLd` emits `FAQPage` structured data from string answers only |
| `Cta` | `title`, `description?`, `actions: ReactNode` |
| `Newsletter` | `heading`, `description?`, `action: (formData: FormData) => void \| Promise<void>` (a server action), `state: FormState`, `buttonLabel?` (default "Join the waitlist"), `legal?: ReactNode`, `idPrefix?` (default `"newsletter-"`) — `<form>` with one email field via `form-feedback` (`FormMessage`, `fieldAria`, `FieldError`); the block renders, the app owns the action |
| `LegalPage` | `title`, `updatedAt: string` (ISO date, rendered "Last updated …"), `sections: { id: string; title: string; paragraphs: string[] }[]`, `notice?: ReactNode` — `<article>` with `<nav aria-label="Contents">` of in-page links and `<h2 id>` per section |

`Newsletter` is a plain component: it takes `action` and `state` as props and holds no state of its
own, so it renders from a server or client tree. The app's small client wrapper (`WaitlistForm` in
www) holds `useActionState(joinWaitlist)` and renders `<Newsletter action={action} state={state} …/>`.

Consent:
- `src/lib/consent.ts` — `CONSENT_COOKIE = "consent"`, `type Consent = "all" | "necessary"`,
  `parseConsent(cookieHeader: string | null): Consent | null`, `consentCookie(value, { domain, secure }) → Set-Cookie attributes` (`Path=/`, `Max-Age=15552000`, `SameSite=Lax`).
- `src/components/cookie-consent.tsx` (client) — `CookieConsent({ domain, privacyHref, initial?: Consent | null })`:
  renders nothing when a consent exists (from `initial`, else from `document.cookie` after mount);
  otherwise a bottom banner `role="region" aria-label="Cookie consent"` with the text "We use
  cookies for sign-in and, if you allow it, to understand how the site is used.", **Accept all**,
  **Necessary only**, and a link to `privacyHref`; writes the cookie with
  `document.cookie` and hides; no focus trap; respects `prefers-reduced-motion`.
- `useConsent(): Consent | null` (client hook reading the cookie, updates on the banner's choice via
  a custom event).
- `WebVitals` gains an optional `consent?: Consent | null` prop; today it changes nothing (dev logs
  only), and the comment names it as the gate for the production reporter.

OG: `src/lib/og.tsx` — `ogImage({ title, subtitle?, brand = "Boilerplate" }) → ImageResponse` (1200×630,
system font stack, the three-bar brand mark, background `#0a0a0a`, text `#fafafa`, accent from a
fixed hex matching the primary token). Exported `OG_SIZE = { width: 1200, height: 630 }`.

### `apps/api`

- Migration `0007_waitlist`: `waitlist (id, email TEXT NOT NULL UNIQUE, source TEXT NOT NULL DEFAULT 'www', created_at TEXT NOT NULL)`.
- `queries/waitlist.ts`: `add({ email, source }) → { created: boolean }` (normalised email; unique
  violation → `created: false`, matched by message on both engines), `count()`.
- Contract `waitlist.join`: input `{ email: EmailSchema, source: z.enum(["www","app","docs","help","jobs"]).default("www") }`,
  output `{ joined: z.literal(true) }`, errors `TOO_MANY_REQUESTS` ("Too many requests, try again in
  a few minutes"); route `POST /waitlist`.
- Handler: `waitlistLimiter.hit(\`waitlist:${clientId}\`)` (5 / 15 min; `clientId` is the
  `x-api-client-id` the anonymous client sends — exposed on `Context` as `clientId`); then `add`;
  if `created`, `detach` a `waitlistWelcome` mail; return `{ joined: true }` either way.
- `@repo/email`: `WaitlistWelcome({ brand?, siteUrl })` — subject "You're on the list", one
  paragraph, link to `siteUrl`; test + story.

### `apps/www`

- Env: `API_URL`, `API_SERVICE_TOKEN` (dev defaults from `@repo/session`'s `loadEnv`; production
  required; `src/instrumentation.ts` asserts them at boot like `apps/app`, using the subset
  `assertEnv(["API_URL","API_SERVICE_TOKEN"])` — add that narrower helper to `@repo/session/env`
  if `assertAuthEnv` cannot take a key list). `transpilePackages` += `@repo/session`,
  `@repo/api-contract`; dependencies likewise.
- `@repo/session` exports `requestInfo(headers)` (moved from `apps/auth/src/lib/request-info.ts`;
  the auth app imports it from there — one move, tests follow).
- `src/lib/api.ts` → `anonymousApi(ip?)` from `createApiClient({ apiUrl, serviceToken, clientId: anonymousClientId(ip) })`.
- `src/lib/actions.ts` → `joinWaitlistCore({ api }, fd): Promise<FormState>`: validate with
  `WaitlistJoinSchema`; success `{ ok: true, message: "You're on the list — check your inbox." }`;
  `TOO_MANY_REQUESTS` → its message; other errors logged → "Something went wrong, try again later.";
  `src/app/actions.ts` `"use server"` `joinWaitlist(prev, fd)`.
- `src/components/waitlist-form.tsx` (client): `useActionState(joinWaitlist)` → `<Newsletter …/>`
  with `legal` = "No marketing without a separate opt-in. Unsubscribe any time."
- `src/content/home.ts` — all landing copy as typed data: hero (title, description, actions →
  `siteUrl("app")` "Open app", `siteUrl("docs")` "Read the docs"), six inline-SVG placeholder
  wordmarks, six features (subdomain apps, typed api, auth + social sign-in, email, CI + tests,
  Docker), three testimonials (marked `placeholder: true` in the data and visually labelled
  "Example" in the demo), tiers Free / Pro / Team with placeholder prices and CTAs to
  `${siteUrl("auth")}/signup`, six FAQ items about the boilerplate, CTA copy, newsletter copy.
- `HomeView`: `Hero` → `LogoCloud` → `FeatureGrid` → `Testimonials` → `Pricing` → `Faq jsonLd` →
  `Cta` → `WaitlistForm`; `Background` retained; `main#main` wraps the sections.
- `/terms`, `/privacy`: pages rendering `LegalPage` from `src/content/terms.ts` and `privacy.ts`
  (sections listed in the design conversation: Terms — Acceptance, Accounts, Acceptable use,
  Content, Termination, Liability, Changes, Contact; Privacy — What we collect, How we use it,
  Sharing, Retention, Your rights, Cookies, Contact) with `[Company]`, `[Jurisdiction]`,
  `[Contact email]` placeholders, `updatedAt`, and the notice "This is a template, not legal
  advice — review it with counsel before publishing." Titles via `metadata`.
- Layout: `metadata.openGraph` / `twitter` defaults (site name, type website, images from the OG
  route); `<CookieConsent domain={cookieDomain} privacyHref="/privacy" />` after the footer, where
  `cookieDomain` is `.brand.localhost` in dev and `COOKIE_DOMAIN` in production (www reads
  `COOKIE_DOMAIN` optionally; absent in production → the banner writes a host-only cookie and the
  README says why consent will then not be shared across subdomains).

### Every Next app

- `src/app/opengraph-image.tsx`: `export const size = OG_SIZE; export const contentType = "image/png"; export default () => ogImage({ title: "<App title>", subtitle: "<one line>" })`; `twitter-image.tsx` re-exports. Static apps add `export const dynamic = "force-static"`.
- `src/lib/routes.ts`: `PUBLIC_ROUTES` (www `/`, `/terms`, `/privacy`; auth `/login`, `/signup`,
  `/forgot-password`; docs/help/jobs `/`; app and account `/`), consumed by `sitemap.ts`
  (`siteUrl(<id>)` base, `lastModified` = build time) and `robots.ts` (`siteUrl` for the sitemap
  URL; auth disallows `/oauth/`, `/magic`, `/verify-email`, `/reset-password`; app/account disallow
  `/api/`).
- Root layouts render `CookieConsent` (the three auth-aware apps pass `initial` from the request
  cookie via `parseConsent`; the four static apps let the component read `document.cookie` after
  mount — a one-frame flash on first visit, documented).

## Tests

- `packages/ui`: render tests per block (landmarks, heading, CTA names incl. tier names, FAQ count
  + JSON-LD, `LegalPage` TOC ↔ section ids, `Newsletter` regions with prefix, `Testimonials`
  figure semantics); `consent.ts` parse/serialise; `og.tsx` smoke (an `ImageResponse` of 1200×630
  — if `next/og` cannot run under `bun test`, the plan tests the element builder and relies on the
  build + browser pass for the route).
- `apps/api`: join creates + mails; repeat → same response, no row, no mail; limiter (5th call
  within the window → `TOO_MANY_REQUESTS`); invalid email → `BAD_REQUEST`; `source` default;
  migration on both engines.
- `apps/www`: `joinWaitlistCore` (invalid, success, limited, down); build output shows every route
  `○` (static) including `/opengraph-image`.
- `@repo/session`: `requestInfo` tests move with it.
- Storybook: stories for the eight blocks, `SectionHeading`, `CookieConsent` (both buttons set the
  cookie and hide the banner), `WaitlistWelcome`.
- Browser pass: www home with all sections, zero console/CSP messages; waitlist validates, succeeds
  (api log shows the welcome mail), repeats silently, and the 6th rapid submission shows the limit
  message; `/terms` + `/privacy` with working TOC; consent banner once per browser, both buttons
  set `consent` on `.brand.localhost`, hidden afterwards on www and app; `/sitemap.xml` +
  `/robots.txt` on www and auth with `brand.localhost` hosts; `/opengraph-image` on www and auth
  returns a 1200×630 PNG; Lighthouse accessibility on www home ≥ 95 (regression guard).
- `bun run ci` green; `SITE_DOMAIN=example.com bun --filter @repo/www build` bakes `https://`
  links in the page and the sitemap.

## Docs

CLAUDE.md: **Blocks** paragraph under Design System Single Points (the eight blocks,
`SectionHeading`, `CookieConsent` + consent cookie + `WebVitals.consent` hook point, `ogImage`),
the new-app checklist (+ `opengraph-image.tsx`, `src/lib/routes.ts`, `CookieConsent`), the env
table (www: `API_URL`, `API_SERVICE_TOKEN`, optional `COOKIE_DOMAIN`); `packages/ui/src/blocks/README.md`;
`apps/www/README.md` (content files, legal placeholders, waitlist, env); `apps/api/README.md`
(`waitlist`); ROADMAP: tick 6c, Phase 6 state (6a–6c done; 6d–6f pending owner decision).

## Out of scope

Blog/MDX, pricing toggle and comparison table, real partner logos, analytics gating (hook only),
admin view or export of the waitlist (6f), double opt-in, i18n, section variants/A-B, a renaming
guide (Phase 5 guides item).
