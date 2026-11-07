# @repo/sites

The one list of this site's apps and how to link between them: pure TypeScript — no React, no env
access at import time — for server components, next config and tests; pass computed hrefs to client
components as props (`process.env.SITE_DOMAIN` is not inlined into the browser bundle).

```ts
import { footerGroups, SITES, siteNav, siteUrl } from "@repo/sites"
```

## The env rule

Every URL is derived from a single variable, `SITE_DOMAIN`:

- Unset → `http://<id>.brand.localhost:<port>`, the dev ports each app already uses
  (`www` 3000, `app` 3001, `auth` 3002, `account` 3003, `docs` 3004, `help` 3005, `jobs` 3006,
  `blog` 3009).
- A `.localhost` domain (e.g. `acme.localhost`) keeps the same `http://<id>.<domain>:<port>` form —
  useful for a renamed local stack.
- Anything else is a real domain: `https://<id>.<domain>`, no port.
- A leading `https://` / `http://` or dot and trailing slashes are dropped, so `https://brand.com`
  and `.brand.com` both mean `brand.com`.
- In production, an unset `SITE_DOMAIN` falls back to the dev form and logs the warning
  (`[sites] SITE_DOMAIN is not set — cross-app links point at brand.localhost`) once per process
  rather than throwing — `next build` always runs in production mode, so a missing value must not
  fail every local build. A `next build` prints it once per worker (four lines for `apps/www`).

`www`, `docs`, `help`, `jobs` and `blog` are static, so their links are fixed at `next build`: build a
production image with `SITE_DOMAIN` set (`docker/next.Dockerfile`'s `SITE_DOMAIN` build arg, default
`brand.localhost`). The same arg sets `ENV SITE_DOMAIN` in the image's runner stage, where `app`,
`auth` and `account` read it per request — so one `--build-arg` covers both, and a different domain
needs a rebuild.

`siteUrl` takes an optional `env` (defaulting to `process.env`) so callers — and tests — can pass
a specific environment instead of depending on the process's.

## Keep this out of `"use client"` files

Every function here but `relabelNav` / `relabelFooter` (and the plain `SITES` data) reads
`process.env` at call time, and that read is never inlined into the browser bundle — a client
component that called `siteUrl` itself would either throw or silently resolve to the dev fallback
in production. A server component (a view or a page) computes the value and passes it down as a
plain prop instead — see `apps/account/src/views/security-view.tsx`'s `securityUrl` →
`ConnectedAccounts`, and `apps/auth/src/views/email-revert-view.tsx`'s `securityUrl` →
`EmailRevertForm`. The repo's `scripts/client-imports.test.ts` (in `bun test scripts`, so every CI
run) enforces this: it fails the moment a `"use client"` file anywhere under `apps/*/src` — or a
local module such a file pulls in (`@/lib/…`, `./…`, followed through files with no directive) —
imports a *value* (not a type) from the bare `@repo/sites` specifier, in any clause shape
(`import { … }`, `import * as`, a default, `export … from`, a side-effect import). Any
`@repo/sites/<subpath>` import, such as the client-safe `./brand` for `BRAND_NAME`, is left alone.
The same file guards `@repo/api-contract`'s root and its Zod-free subpaths.

## `BRAND_NAME`

`packages/sites/src/brand.ts` exports the one constant every title, manifest, OG image, email and
the brand link read: `export const BRAND_NAME = "Boilerplate"`. It's re-exported from `@repo/sites`
and also importable directly as `@repo/sites/brand` — the narrower subpath, since it exports
nothing but the string and reads no env, so a client component can pull it in without dragging
along the rest of the package. See `docs/guides/renaming-the-brand.md` for every place it's read
and what to check after changing it.

## `siteNav` / `footerGroups`

- `siteNav(current, env?)` returns the cross-app navigation — App, Docs, Blog, Help, Jobs — with
  the current app flagged `current: true` rather than removed or re-pointed; `www` is a
  destination, never a nav item (it IS the marketing home, not something to navigate back to from
  itself).
- `footerGroups(env?)` returns the footer's three link groups, in the same order on every app:
  Product (App, Docs), Company (Blog, Jobs, Help), Account (Sign in, Account). Each group and link
  carries an `id` (`FooterGroupId` / `SiteId`).
- `relabelNav(links, site)` / `relabelFooter(groups, site, group)` replace those English labels
  and titles by id — how the translated apps (`app`, `auth`, `account`) show them in the reader's
  language (`ui.sites.<id>`, `ui.footerGroups.<id>`). Ids, hrefs and `current` stay as they are; the
  static apps render the English labels unchanged.

## Add your app here first

A new subdomain app's URL comes from its entry in `SITES`; to list it in the header nav or the
footer, also add it to `NAV` / `footerGroups` in `src/index.ts`. Add it here before wiring up the app itself — the shared header and footer and `@repo/session`'s dev
`AUTH_URL` / `APP_URL` build on this registry rather than hardcoding a host or port a second time.
