# @repo/www

Marketing site — Next.js 16 on www.brand.localhost:3000 in development, `www.brand.com` in production.

The public marketing site: a demo landing page built from the `@repo/ui` blocks, `/terms` and
`/privacy` templates, a waitlist form backed by `apps/api`, the cookie consent banner, OG images,
`sitemap.ts`, `robots.ts` and a `not-found` page. Every page is statically rendered.

```bash
bun --filter @repo/www dev       # http://www.brand.localhost:3000
bun --filter @repo/www build     # standalone output for docker/next.Dockerfile
bun --filter @repo/www analyze   # bundle report in .next/analyze/
```

## Routes

| Route | Dev URL |
|---|---|
| `/` | http://www.brand.localhost:3000 |
| `/terms` | http://www.brand.localhost:3000/terms |
| `/privacy` | http://www.brand.localhost:3000/privacy |

Every app also serves `/offline` (the PWA fallback page) and `/api/health` (used by the Docker
health check).

## Content

All copy lives in data files; the views and pages only arrange blocks.

- `src/content/home.tsx` — the landing page: hero, logos, features, testimonials, pricing tiers,
  FAQ, CTA and waitlist copy. Rename the product or rewrite the pitch here. Cross-app links go
  through `siteUrl()` from `@repo/sites`, so `SITE_DOMAIN` at build time sets them all.
  - The six logos are placeholder text wordmarks (Acme, Globex, …), not real marks. Replace them
    with your customers' logos (`{ name, src }` renders an `<img>`).
  - The testimonials carry `placeholder: true`; the view labels them "· Example" until you replace
    them with real quotes and drop the flag.
  - Pricing tiers' name, price, period and seat/feature lines derive from `@repo/api-contract`'s
    `PLANS` (`tiersFromPlans()`); only the marketing copy — descriptions, extra bullets and CTA
    labels — lives in `home.tsx`'s `PLAN_COPY`. Tiers link to `${siteUrl("auth")}/signup?plan=<key>`.
  - New `lucide:` icon names need `bun icons:bundle` (write the full `lucide:<name>` string so the
    bundler's scan finds it).
- `src/content/terms.ts`, `src/content/privacy.ts` — the legal templates, one `LegalSection` per
  heading. Replace `[Company]`, `[Jurisdiction]` and `[Contact email]`, update `updatedAt`, and have
  counsel review them. Each page shows the notice in `src/content/legal-notice.ts` until you remove it.

## Waitlist

`src/components/waitlist-form.tsx` (client) renders the `Newsletter` block with `useActionState`
over the `joinWaitlist` server action in `src/app/actions.ts`. The action reads the browser's ip
(`requestInfo` from `@repo/session`), builds an anonymous api client keyed on it
(`src/lib/api.ts`, service token only) and calls `waitlist.join`. The logic lives in
`src/lib/actions.ts` (`joinWaitlistCore`, tested with `bun test`): invalid email → field error,
success → "You're on the list — check your inbox.", a rate-limit refusal → the page's own English
`TOO_MANY_REQUESTS` (never the api's text, which follows the `x-locale` sent for the welcome mail),
anything else is logged and shown as a generic failure. The api answers the same for a new and a
repeated email, so the form never reveals who is on the list. Only the action reads the request —
the pages stay static. The form works without JavaScript. Likewise, so pages read without JavaScript, the app ships no
root `loading.tsx` (React would outline the large static pages behind an inline script).

The api limits joins per `x-api-client-id`; www sends one per browser ip. That is reliably the
browser's own behind a proxy that sets `x-real-ip` or overwrites `x-forwarded-for`. With no proxy,
`next start` fills `x-forwarded-for` from the socket, but a direct client can send its own header,
so the key is best-effort; behind a proxy that sets neither, every visitor shares the proxy's
bucket.

## Cookie consent

The layout renders `CookieConsent` from `@repo/ui` after the footer. It writes `consent=all|necessary`
on the cookie domain: `COOKIE_DOMAIN`, else `.brand.localhost` outside production. The value is read
at **build** time (the app is static), so set `COOKIE_DOMAIN` in the build environment — the Compose
build (`docker-compose.yml`) already does this, passing it to `docker/next.Dockerfile`'s builder
stage as a `COOKIE_DOMAIN` build arg (default `.brand.localhost`), so an image built that way shares
the choice across subdomains without extra setup. A production build run outside Compose without it
writes a host-only cookie: the choice then holds on www only, and the other subdomains ask again.
The banner reads the cookie after mount (a one-frame check on first visit).

## Locale

The header's `StaticLocaleSwitcher` (`@repo/ui/components/static-locale-switcher`) lets a visitor
pick a language — not for this page, which stays English (the static apps stay static), but for
the shared `locale` cookie every signed-in app reads. Until hydrated it renders an invisible,
`aria-hidden`, `inert` placeholder of the same size (nothing is safe to read before that, and the
header must not shift when it appears), then adopts the cookie's own value if one is already set; picking a
language writes the cookie itself (`writeLocaleCookie`, the same `document.cookie = …` pattern
`CookieConsent` above already uses, built from `@repo/i18n/cookie`'s `localeCookie`) and shows a
"Saved — signed-in pages will use it." note in a polite live region, which stays until the page
is reloaded. It takes the same build-time `cookieDomain` the consent banner does: building without `COOKIE_DOMAIN` writes a
host-only cookie, so the choice holds on `www` only and the signed-in apps never see it (see
`apps/e2e/README.md`'s **Run** section for where the e2e build sets it).

The waitlist action also resolves and sends `x-locale` to the api: `resolveWaitlistLocale`
(`src/lib/actions.ts`) reads the `locale` cookie, then `Accept-Language` — the same precedence
`anonymousApi()` uses in the signed-in apps — and sends nothing rather than a guessed locale when
neither names a supported one. The api stores it against the new waitlist row and sends the
welcome mail in that language. See `docs/guides/i18n.md` and the root `CLAUDE.md`'s **i18n.**
paragraph for the shared layer.

## Environment

| Var | Needed for | Dev default | Production |
|---|---|---|---|
| `API_URL` | the waitlist action | `http://api.brand.localhost:3007` | required — `next start` refuses without it (`src/instrumentation.ts`) |
| `API_SERVICE_TOKEN` | the waitlist action | the dev token | required, as above |
| `COOKIE_DOMAIN` | the consent cookie (build time) | `.brand.localhost` | optional — see above |
| `SITE_DOMAIN` | every cross-app link (build time) | `brand.localhost` with dev ports | your parent domain |

## Where things go

- **Views** — `src/views/<route>-view.tsx`: page-level compositions of `@repo/ui` blocks and
  components. Pages in `src/app/` stay thin and just render a view.
- **Content** — `src/content/`: the copy each view or page renders.
- **App-only components** — `src/components/`. Anything shared by two apps belongs in
  `packages/ui` instead.
- **Styles** — `src/styles/globals.css` starts with `@import "@repo/ui/globals.css";`; fonts, theme,
  skip link and web vitals come from `@repo/ui` too.

See the root [README](../../README.md) and [CLAUDE.md](../../CLAUDE.md) for the conventions shared by
all apps.
