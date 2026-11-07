# Benchmark: `boilerplate-bun` against popular SaaS starters

**Date:** 2026-10-01 · **Kind:** research spike (no code) · **Decision owner:** repo owner

## Question

Where does this repo stand on feature parity against the popular SaaS boilerplates — paid and
open source — and which gaps would most raise its appeal across three audiences: solo founders
shipping a SaaS, teams/agencies starting client products, and engineering-first users who judge a
starter by its DX and code quality?

## Short answer

The repo is **ahead of every kit surveyed on engineering depth** and **behind most of them on the
"first week of a SaaS" layer**.

- Things we have that almost nobody else does: seven deployable subdomain apps from one
  registry (1.5 of 9 kits), PWA/offline (0 of 9), a real test suite over HTTP (1.5 of 9), CI with a
  change planner (4 of 9), Dockerfiles + Compose (2.5 of 9), typed RPC + OpenAPI (3.5 of 9), an AI
  service with a keyless mock provider (4.5 of 9), shared security headers/CSP (3 of 9).
- Things most kits have that we do not: OAuth (7 of 9), landing-page blocks (7 of 9), magic
  link (6 of 9), billing (6 of 9), SEO beyond a sitemap stub (6 of 9), transactional email (5 of 9),
  blog/MDX (5 of 9), legal pages (4 of 9 — and our footer already links to `/terms` and `/privacy`,
  which 404).

The recommendation is a **Phase 6 in six sub-projects**, ordered so each one unlocks the next:
email provider → OAuth + magic link → marketing kit (landing blocks, legal, SEO, waitlist) →
billing → organisations/RBAC/invitations → admin. Two of those (billing, organisations) reverse
earlier "a starter should not decide this" rulings; the data says founders and agencies expect both,
so the decision is called out explicitly below rather than assumed.

## Who we compared against

| Kit | Kind | Price (2026-10-01) | Stack in one line | Who it is for |
|---|---|---|---|---|
| ShipFast | paid | $199 / $249 / $299 one-time | Next.js, NextAuth (Google + magic link), Mongo/Supabase, Stripe/LemonSqueezy, Mailgun/Resend, daisyUI | Solo indie hackers, B2C MVP |
| BuilderKit | paid | $99 / $149 / $199 one-time | Next.js, Supabase, Stripe/LemonSqueezy, Loops/Resend, multi-LLM demos | Solo devs building AI tools |
| Makerkit | paid | $349 / $649 one-time | Next.js 16, Turborepo, Supabase or Drizzle/Prisma + Better Auth, Stripe (+LS/Paddle/Polar), shadcn | B2B multi-tenant SaaS, agencies |
| Supastarter | paid | ~$349 / $799 / $1,499 one-time | Next.js/Nuxt/TanStack, Better Auth, Prisma/Drizzle, five payment providers, Turborepo | Indie → agency |
| Shipixen | paid | $249/yr or $379 lifetime | Next.js 15 marketing-site generator, MDX, shadcn | Marketing sites; bring your own auth/billing |
| next-forge | MIT | free · 7.7k ★ | Turborepo multi-app (web/app/api/docs/email/storybook), Clerk, Stripe, Prisma, Resend, PostHog, Sentry, Arcjet | Teams wanting a vendor-wired skeleton |
| create-t3-app | MIT | free · 29.1k ★ | Interactive CLI: Next.js, tRPC, Prisma/Drizzle, Auth.js, Tailwind | Developers wanting a typesafe scaffold |
| create-t3-turbo | MIT | free · 6.1k ★ | Turborepo, Next.js + Expo sharing one tRPC API, Drizzle, Better Auth | Web + mobile teams |
| nextjs/saas-starter | MIT | free · 16.2k ★ | Next.js, Postgres, Drizzle, Stripe, shadcn — Vercel's reference | The canonical free baseline |
| Marblism | — | $24–44/mo subscription | *Pivoted in 2026 to a hosted "AI employees" automation product; no exportable codebase* | Not a boilerplate any more — **excluded from scoring** |

Sources and access dates are in the appendix. Status cells for competitors come from their public
docs, READMEs and reviews; `?` means the public material did not say and we did not buy the kit.

## The matrix

Legend: ✓ built in · ◐ partial · ✗ absent · ? unverifiable · **P** planned (open item in
`docs/ROADMAP.md`). "Kits" is how many of the nine scored kits have it (◐ counts ½). Our column
is verified against source on branch `feat/site-chrome` (PR #44), not against our docs.

| Capability | Us | Kits /9 | ShipFast | BuilderKit | Makerkit | Supastarter | next-forge | t3-app | t3-turbo | Shipixen | saas-starter |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| Email + password auth | ✓ | 6.5 | ✗ | ✓ | ✓ | ✓ | ✓ | ◐ | ✓ | ✗ | ✓ |
| OAuth providers | ✗ | 7 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Magic link / passkeys | ✗ | 6 | ✓ | ✓ | ✓ | ✓ | ◐ | ◐ | ◐ | ✗ | ✗ |
| Two-factor | ✗ | 2.5 | ✗ | ✗ | ✓ | ✓ | ◐ | ✗ | ◐ | ✗ | ✗ |
| Organisations / teams / invites | ✗ | 3.5 | ✗ | ✗ | ✓ | ✓ | ◐ | ✗ | ✗ | ✗ | ✓ |
| Roles & permissions | ✗ | 3.5 | ✗ | ✗ | ✓ | ✓ | ◐ | ✗ | ✗ | ✗ | ✓ |
| Billing provider | ✗ | 6 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ |
| Webhooks / portal / entitlements | ✗ | 5 | ◐ | ◐ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✓ |
| Transactional email | ◐ | 5 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Admin panel | ✗ | 3 | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Waitlist | ✗ | 3 | ✗ | ✓ | ✓ | ? | ✗ | ✗ | ✗ | ✓ | ✗ |
| Landing-page blocks | ◐ | 7 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ |
| Blog / MDX / CMS | ✗ | 5 | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ |
| SEO (metadata, sitemap, OG) | ◐ | 6 | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ |
| i18n | ✗ | 3 | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Product analytics | ✗ | 3 | ◐ | ✗ | ✓ | ◐ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Error tracking / vitals sink | **P** | 3 | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| AI features | ✓ | 4.5 | ✗ | ✓ | ◐ | ✓ | ✓ | ✗ | ✗ | ✓ | ✗ |
| Typed API layer | ✓ | 3.5 | ✗ | ✗ | ? | ✓ | ◐ | ✓ | ✓ | ✗ | ✗ |
| Database + migrations | ✓ | 8 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ |
| File storage | ✗ | 2 | ? | ? | ? | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Background jobs | ✗ | 1.5 | ✗ | ✗ | ? | ✓ | ◐ | ✗ | ✗ | ✗ | ✗ |
| Realtime | ✗ | 2.5 | ✗ | ◐ | ✓ | ? | ✓ | ✗ | ✗ | ✗ | ✗ |
| Unit / integration tests | ✓ | 1.5 | ✗ | ✗ | ✓ | ? | ◐ | ✗ | ✗ | ✗ | ✗ |
| Browser e2e tests | **P** | 2 | ✗ | ✗ | ✓ | ✓ | ? | ✗ | ✗ | ✗ | ✗ |
| CI / quality gates | ✓ | 4 | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| Deployment docs | ◐ | 8 | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | ◐ | ✓ | ✓ |
| Docker | ✓ | 2.5 | ✗ | ? | ✓ | ✓ | ✗ | ◐ | ✗ | ✗ | ✗ |
| Monorepo | ✓ | 4 | ✗ | ✗ | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ | ✗ |
| Multiple apps on subdomains | ✓ | 1.5 | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ | ◐ | ✗ | ✗ |
| Design system + Storybook | ✓ | 5.5 | ◐ | ◐ | ✓ | ✓ | ✓ | ✗ | ◐ | ◐ | ◐ |
| PWA / offline | ✓ | 0 | ✗ | ✗ | ✗ | ? | ✗ | ✗ | ✗ | ✗ | ✗ |
| DX tooling | ✓ | 6.5 | ◐ | ? | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | ◐ |
| Guides | **P** | 7.5 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ◐ | ◐ | ◐ |
| Legal pages / consent | ✗ | 4 | ✓ | ✓ | ? | ✓ | ? | ✗ | ✗ | ✓ | ✗ |
| Security headers, rate limits, CSRF | ✓ | 3 | ◐ | ✗ | ◐ | ◐ | ✓ | ✗ | ✗ | ✗ | ◐ |

Our column, in detail (evidence paths were checked in source): email+password with argon2id,
30-day sessions and reset tokens (`apps/api`, `apps/auth`); the OAuth buttons in
`apps/auth/src/components/social-buttons.tsx` are a mockup; `apps/api/src/mailer.ts` is a `Mailer`
seam with a log-only implementation; `packages/ui/src/blocks` holds one landing block (`hero`),
the rest is site chrome; every app's `sitemap.ts` lists one URL and no app has an
`opengraph-image`; `apps/www`'s footer links `/terms` and `/privacy`, neither exists;
`apps/account`'s payments, people-sharing and data-privacy views are static mockups;
`apps/docs`, `apps/help`, `apps/jobs` are empty shells with a hero.

## What the comparison says about positioning

- **Our shape is next-forge's shape** — multi-app monorepo with shared packages — but ours runs on
  Bun with no vendor lock-in (next-forge wires Clerk, Stripe, Sentry, PostHog, Arcjet), has Docker
  and tests (next-forge has neither confirmed), and has seven routable apps instead of a flat set
  of workspaces. That is the honest comparison to lead with, not ShipFast.
- **Paid kits sell the week-one layer.** Every buyer review praises the same thing: auth with
  social login, payments, email and a landing page working within hours. None of them is praised
  for architecture. Our architecture is the moat; the week-one layer is the gap.
- **The top tier (Makerkit, Supastarter) differentiates on B2B**: teams, RBAC, per-seat billing,
  super-admin impersonation, plugin architecture. The free tier (t3, saas-starter) differentiates
  on minimalism. We are closer to the top tier in ambition and should compete there.
- **Nobody ships PWA, almost nobody ships tests, CI or Docker.** These are real advantages for the
  teams/agencies audience and should be named on the README, not buried in CLAUDE.md.
- **Deployment story is Docker-only.** Eight of nine kits document a one-click Vercel path;
  founders expect it. A Vercel guide (seven projects, `SITE_DOMAIN`, `COOKIE_DOMAIN`, the api/ai
  services on Fly/Railway) belongs in the planned guides.

## Ranked gaps

Score = audiences served (F founders, T teams/agencies, E engineering-first) × prevalence among
kits ÷ effort. Effort is a plan-sized estimate against this repo's existing seams.

| # | Gap | Kits /9 | Audiences | Effort | Why this rank | Seam it plugs into |
|---|---|:-:|:-:|:-:|---|---|
| 1 | **Transactional email provider + templates** (Resend adapter behind `Mailer`; React Email templates: reset, welcome, verify, invite; dev preview route) | 5 | F T | S–M | Cheapest gap; every later item (OAuth linking, magic link, invitations, billing receipts) needs real mail. The seam already exists. | `apps/api/src/mailer.ts`, `logMailer` |
| 2 | **OAuth (Google, GitHub) + magic link** | 7 / 6 | F T E | M | Highest-prevalence gap; the buttons are already on the auth pages as mockups. Keep sessions as they are — add grant types in `apps/api`, account linking by verified email. | `auth.*` procedures, `@repo/session`, `social-buttons.tsx` |
| 3 | **Marketing kit**: landing blocks (features, pricing, FAQ, testimonials, CTA, logo cloud, newsletter/waitlist), `/terms` + `/privacy` pages, real sitemaps, OG image route, cookie-consent component | 7 / 4 / 6 / 3 | F T | M | Plays to the repo's strength (`packages/ui` + Storybook) and fixes two visible defects: the footer's 404 links and one-URL sitemaps. Waitlist rides along at near-zero cost. | `packages/ui/src/blocks`, `apps/www`, per-app `sitemap.ts` |
| 4 | **Billing** (Stripe first, provider interface like `Mailer`; checkout, webhooks → `subscriptions` table, customer portal, entitlements on the session user; `apps/account` payments view goes live) | 6 / 5 | F T | L | The single feature founders cite most; without it the kit is not a "SaaS" starter in their eyes. **Reverses the ROADMAP's "payments are a product decision" ruling — needs an explicit yes.** | `apps/api` router + migrations, `apps/account/views/payments-view.tsx` |
| 5 | **Organisations, RBAC, invitations** (orgs + memberships + roles tables; org switcher in `UserMenu`; invite by email; `requireRole`) | 3.5 | T | L | The top-tier kits' differentiator and the agency audience's first question. Depends on #1 (invites) and shapes #4 (per-seat billing), so design them together even if shipped apart. | `apps/api` migrations/queries, `@repo/session`, `apps/account/people-sharing` mockup |
| 6 | **Error tracking + vitals destination** (already planned) — provider-agnostic `reportError` + Sentry adapter, vitals `sendBeacon` to a configurable endpoint | 3 | T E | M | Pro kits have it; ours is a TODO comment in `web-vitals.tsx`. Keep on Phase 5. | `@repo/ui/components/web-vitals`, `error.tsx` files |
| 7 | **Content pipeline**: MDX blog on `www` and a docs engine for `apps/docs` (fumadocs or similar) | 5 | F | M | Turns two empty shells into product; blog is the SEO channel every founder kit sells. | `apps/www`, `apps/docs` |
| 8 | **Admin**: user list, search, impersonation, basic metrics, behind a `superadmin` role | 3 | T | M | Only meaningful after #5 gives it roles. | New `apps/admin` or `(admin)` group in `apps/account` |
| 9 | **Guides incl. Vercel + Fly/Railway** (already planned) | 7.5 | F T E | S | Eight of nine kits document deploy; ours documents Docker only. | `docs/` |
| 10 | **File storage** (S3/R2 adapter, presigned uploads, avatar upload as the example) | 2 | F T | M | Low prevalence; natural once accounts have avatars and orgs have logos. | `apps/api` |
| 11 | **Browser e2e** (already planned) | 2 | E | M | Keep on Phase 5; our tests already beat the field. | `apps/story` Vitest browser harness or Playwright |

Not recommended, confirmed by the data: i18n (3/9, ruled out in ROADMAP), background jobs (1.5/9),
realtime (2.5/9), 2FA (2.5/9 — revisit after OAuth), a mobile app (t3-turbo's niche).

## Recommendation: Phase 6 — "the week-one layer"

Finish Phase 5 as planned (observability, e2e, guides — with the Vercel guide added). Then:

| Sub-project | Scope | Depends on | Size |
|---|---|---|---|
| 6a Email | Resend adapter, React Email templates, dev preview, `EMAIL_FROM` env, docs | — | S–M |
| 6b Social + magic sign-in | Google, GitHub, magic link; account linking; `apps/auth` buttons live | 6a | M |
| 6c Marketing kit | 7–8 landing blocks with stories, `/terms` + `/privacy`, OG image, real sitemaps, waitlist block + `waitlist` table, cookie consent | — | M |
| 6d Billing | Stripe behind a provider interface, webhooks, portal, entitlements, live payments view | 6a | L |
| 6e Organisations | orgs/memberships/roles, invitations, org switcher, `requireRole` | 6a | L |
| 6f Admin | user list, impersonation, metrics, behind `superadmin` | 6e | M |

Each row is its own brainstorm → spec → plan → PR, like Phases 3–5. 6a and 6c are independent and
can start immediately; 6c is the one most visible to a visitor and the cheapest to show off.

**Decisions for the owner before Phase 6 starts**

1. Billing (6d) and organisations (6e) contradict the ROADMAP's "decisions a starter should not
   make" list. The benchmark says both are table stakes for two of the three audiences. Yes or no?
2. Provider defaults: Resend for mail and Stripe for billing are what eight of nine kits chose;
   both would sit behind an interface with a log/mock implementation (as `Mailer` and `mock:echo`
   do today) so the repo keeps running keyless.
3. Whether `apps/docs` should become a real docs engine (7) or stay a shell — it decides whether
   the content pipeline is one sub-project or two.

## Appendix A — per-kit notes

**ShipFast.** Praised for speed (auth + Stripe + email + landing in ~2 h) and community; criticised
for no tests, no teams, no admin, unclear maintenance. Single app, no monorepo, no Docker.

**BuilderKit.** Praised for 14–17 ready AI demo apps across GPT-4/Claude/Mistral/Llama, Deepgram,
Stable Diffusion; criticised as thin outside AI (no tests, RBAC, CI, observability; Supabase lock-in).

**Makerkit.** Praised for code quality, plugin architecture (customisations never conflict with
upstream) and docs depth; criticised as pricey and "overkill" for validation. The most complete B2B
stack: teams, granular RBAC, per-seat billing, super-admin impersonation, i18n, e2e tests, Docker.

**Supastarter.** Five payment providers behind one abstraction, seat-based billing, super-admin,
Next/Nuxt/TanStack variants; criticised for price at the agency tier and a private repo.

**Shipixen.** A themed marketing-site *generator* (63+ themes, 300+ demos) rather than a repo; no
auth or billing by design. Relevant to us only as a bar for landing-block quality.

**next-forge.** Our closest structural analogue: Turborepo with web/app/api/docs/email/storybook,
Clerk, Stripe, Resend, PostHog, Sentry, Arcjet, MIT, 7.7k ★. Criticised for vendor lock-in and no
admin/Docker/confirmed tests.

**create-t3-app / create-t3-turbo.** Best-in-class DX and docs; explicitly not SaaS boilerplates
(no billing, teams, admin, tests). t3-turbo's niche is one tRPC API for Next.js + Expo.

**nextjs/saas-starter.** Vercel's canonical free reference (16.2k ★): Stripe, basic teams + RBAC,
activity log; deliberately minimal — no email, admin, tests, CI, Docker.

**Marblism.** Formerly a YC W24 Next.js code generator; in 2026 a hosted multi-agent business
automation subscription with no exportable code. Not comparable; listed because it was asked about.

## Appendix B — method and sources

Three read-only research passes on 2026-10-01: competitor material via web search and the kits'
own sites/docs/GitHub (primary sources preferred, `?` where marketing pages did not say), and a
source-level inventory of this repo on `feat/site-chrome`. Competitor rows are as the kits describe
themselves plus independent reviews; no kit was purchased. Prices move often — re-check before
quoting.

Sources: shipfa.st, shipfa.st/docs; builderkit.ai; makerkit.dev (docs, pricing, blog comparisons);
supastarter.dev; shipixen.com; next-forge.com and github.com/vercel/next-forge;
create.t3.gg and github.com/t3-oss/create-t3-app, github.com/t3-oss/create-t3-turbo;
opensaas.sh (surveyed, not scored); github.com/nextjs/saas-starter; marblism.com and 2026 press
coverage of its pivot; third-party roundups (boilerplatelist, saasboilerplates.dev, Makerkit's
competitor pages) for review sentiment. The raw per-kit tables are reproduced in the matrix above; the URLs consulted follow.

### Source URLs (access date 2026-10-01)

- [ShipFast — official site](https://shipfa.st/) — accessed 2026-10-01
- [ShipFast — docs](https://shipfa.st/docs) — accessed 2026-10-01
- [ShipFast Review 2026 — dupple.com](https://dupple.com/tools/shipfast) — accessed 2026-10-01
- [Best Next.js SaaS Boilerplates & Templates in 2026 — Makerkit blog comparison](https://makerkit.dev/blog/saas/best-nextjs-saas-boilerplate) — accessed 2026-10-01
- [ShipFast Review (2026) — boilerplatehub.com](https://boilerplatehub.com/detail/ShipFast/review) — accessed 2026-10-01
- [ShipFast: Pricing, Features & Alternatives — boilerplatehub.com](https://boilerplatehub.com/detail/ShipFast) — accessed 2026-10-01
- [BuilderKit — official site](https://www.builderkit.ai/) — accessed 2026-10-01
- [BuilderKit Review — aichief.com](https://aichief.com/ai-website-builder/builderkit/) — accessed 2026-10-01
- [Builderkit AI Boilerplate — buildkits.dev](https://www.buildkits.dev/boilerplates/builderkit-ai) — accessed 2026-10-01
- [Marblism — official site](https://www.marblism.com/) — accessed 2026-10-01
- [Marblism — pricing page](https://www.marblism.com/pricing) — accessed 2026-10-01
- [Marblism Review (May 2026) — pondero.ai](https://pondero.ai/agents/reviews/marblism-review-may-2026/) — accessed 2026-10-01
- [Marblism Review — makerstack.co](https://makerstack.co/reviews/marblism-review/) — accessed 2026-10-01
- [Marblism Boilerplate (legacy product) — buildkits.dev](https://www.buildkits.dev/boilerplates/marblism) — accessed 2026-10-01
- [Launch HN: Marblism (YC W24)](https://webbindustries.com/hackernews/story/41568343) — accessed 2026-10-01
- [Makerkit — official site](https://makerkit.dev/) — accessed 2026-10-01
- [Best Next.js SaaS Boilerplates in 2026: 8 Kits Compared — nexty.dev](https://nexty.dev/blogs/best-nextjs-saas-boilerplates-2026) — accessed 2026-10-01
- [Makerkit Review 2026 — starterpick.com](https://starterpick.com/guides/makerkit-review-2026) — accessed 2026-10-01
- [MakerKit: Pricing, Features & Alternatives (2026) — boilerplatehub.com](https://boilerplatehub.com/detail/MakerKit) — accessed 2026-10-01
- https://supastarter.dev/ (accessed 2026-10-01)
- https://supastarter.dev/saas-boilerplate (accessed 2026-10-01)
- https://supastarter.dev/best-nextjs-boilerplate-2026 (accessed 2026-10-01)
- https://tinylaunchpad.com/blog/supastarter-review-2026-best-next-js-saas-boilerplate (accessed 2026-10-01)
- https://boilerplatehub.com/detail/supastarter (accessed 2026-10-01)
- https://www.saasworthy.com/product/supastarter-platform (accessed 2026-10-01)
- https://github.com/haydenbleasel/next-forge (accessed 2026-10-01)
- https://github.com/haydenbleasel/next-forge/blob/main/README.md (accessed 2026-10-01)
- https://api.github.com/repos/vercel/next-forge/contents/ (accessed 2026-10-01)
- https://api.github.com/repos/vercel/next-forge/contents/packages (accessed 2026-10-01)
- https://api.github.com/repos/vercel/next-forge/contents/apps (accessed 2026-10-01)
- https://www.next-forge.com/ (accessed 2026-10-01)
- https://vercel.com/academy/production-monorepos/next-forge-patterns (accessed 2026-10-01)
- https://github.com/t3-oss/create-t3-app (accessed 2026-10-01)
- https://www.star-history.com/t3-oss/create-t3-app/ (accessed 2026-10-01)
- https://create.t3.gg/ (referenced via search, accessed 2026-10-01)
- https://github.com/t3-oss/create-t3-turbo (accessed 2026-10-01)
- https://api.github.com/repos/t3-oss/create-t3-turbo/contents/ (accessed 2026-10-01)
- https://starterpick.com/guides/create-t3-turbo-review-2026 (accessed 2026-10-01)
- https://opensaas.sh/ (accessed 2026-10-01)
- https://github.com/wasp-lang/open-saas (accessed 2026-10-01)
- https://api.github.com/repos/wasp-lang/open-saas/contents/template (accessed 2026-10-01)
- https://wasp.sh/blog/2026/04/23/14k-stars-open-saas-ai-era (accessed 2026-10-01)
- https://github.com/wasp-lang/open-saas/tree/main/.github/workflows (accessed 2026-10-01)
- https://github.com/wasp-lang/open-saas/issues/558 (accessed 2026-10-01)
- https://github.com/wasp-lang/open-saas/issues/613 (accessed 2026-10-01)
- https://shipixen.com/ (accessed 2026-10-01)
- https://shipixen.com/pricing (accessed 2026-10-01)
- https://boilerplatehub.com/detail/Shipixen/review (accessed 2026-10-01)
- https://github.com/nextjs/saas-starter (accessed 2026-10-01)
- https://api.github.com/repos/nextjs/saas-starter/contents/ (accessed 2026-10-01)
- https://vercel.com/templates/saas/next-js-saas-website-starter (accessed 2026-10-01)
- https://github.com/boxyhq/saas-starter-kit (accessed 2026-10-01, considered and rejected for slot 6 — stale, no release since Dec 2024)
- https://www.skene.ai/resources/blog/plg-analysis-ixartz-saas-boilerplate (accessed 2026-10-01, considered and rejected for slot 6 — fewer stars/activity than nextjs/saas-starter)
- https://makerkit.dev/blog/saas/best-nextjs-saas-boilerplate (accessed 2026-10-01)
