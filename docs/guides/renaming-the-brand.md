# Renaming the brand

The starter ships as **Boilerplate**. One constant drives every title, manifest, OG image, email
and footer that says so; a test keeps the name from leaking back in as a literal string anywhere
else.

## The name

Edit `BRAND_NAME` in `packages/sites/src/brand.ts`:

```ts
export const BRAND_NAME = "Boilerplate"
```

It's re-exported from `@repo/sites` and also importable directly as `@repo/sites/brand` — the
narrower subpath a client component can pull in without dragging along the rest of the package
(`@repo/sites/brand` exports nothing but the string, and reads no env, so it's safe in a browser
bundle). Changing it updates, on the next build or dev reload:

| Reads it | Where |
|---|---|
| Page titles | every app's `src/app/layout.tsx` — the `default` title and the `%s \| ${BRAND_NAME}` template |
| Footer copyright | the same `layout.tsx` files, plus `apps/account/src/app/(account)/layout.tsx` |
| Web app manifests | every app's `src/app/manifest.ts` (`name`; only `www`'s also sets `short_name` to it — the other apps set a literal `short_name`, e.g. `"Docs"`) |
| OG images | every app's `src/app/opengraph-image.tsx` (the `alt` text; `apps/www` also passes it as the rendered `title`) |
| The brand link | `Brand` in `packages/ui/src/components/brand.tsx` (its default `name` prop) |
| The default OG renderer | `ogImage`'s default `brand` in `packages/ui/src/lib/og.tsx` |
| Transactional emails | `BRAND` in `packages/email/src/templates/layout.tsx`, re-exporting `BRAND_NAME` |
| The api's dev mail sender | `DEV_MAIL_FROM` in `apps/api/src/env.ts` (the address `MAIL_FROM` falls back to outside production — see **What is not a constant** below) |
| Storybook's chrome | `apps/story/.storybook/theme.ts` (`brandTitle`) |
| Account copy | `apps/account/src/views/home-view.tsx` and `personal-info-view.tsx` |

`scripts/brand.test.ts` (part of `bun test scripts`, which `bun run ci` runs) walks every tracked
`.ts`/`.tsx` under `apps/*/src` and `packages/*/src` and fails if the literal string `"Boilerplate"`
appears anywhere outside `packages/sites/src/brand.ts` itself or a `*.test.ts(x)` file. So after
editing the constant, grep for what the guard won't catch — anything outside `src/`:

```bash
git grep -n Boilerplate -- ':!docs'
```

Past the guard's own files (`scripts/brand.ts`, `scripts/brand.test.ts`, `packages/sites/src/brand.ts`),
test files such as `apps/api/src/mail/mail.test.ts`, and prose that already explains the default
(`CLAUDE.md`, the `README.md`s), this prints the real hits to fix by hand:
`docker-compose.yml:172` (the api's `MAIL_FROM` Compose default), `.env.example:26` and
`apps/api/.env.example:67` (the same default, documented), `apps/story/stories/Introduction.mdx:1`
(Storybook's landing page), `scripts/doctor.ts:107` (its banner) and
`.github/workflows/release.yml.disabled:123` (the release title). The guard only proves
first-party app and package code stopped hardcoding the old name.

## The domain

The brand name is cosmetic; the domain is what actually changes behavior. In production, `apps/www`,
`apps/docs`, `apps/help` and `apps/jobs` read `SITE_DOMAIN` **at `next build`** — it's baked into
the static output, so a new domain needs a rebuild, not a new runtime env var. `apps/app`, `apps/auth`
and `apps/account` read it per request instead, from the `SITE_DOMAIN` the Docker image sets as an
`ENV` at the same build. `COOKIE_DOMAIN` is different: it's a build arg only for the static apps
(baked into their consent cookie at `next build`), but a runtime environment variable for `app`,
`auth` and `account` — `assertAuthEnv()` fails them at boot without it; there's no build-time
default for the signed-in apps. See `docs/guides/deploying.md` for the exact
`docker build --build-arg` invocations, the runtime `COOKIE_DOMAIN` those three apps need, and the
publish workflow's `SITE_DOMAIN` / `COOKIE_DOMAIN` repository variables.

Dev keeps `*.brand.localhost` regardless of what `BRAND_NAME` or `SITE_DOMAIN` say — `packages/sites`'
`SITE_DOMAIN` unset falls back to `brand.localhost`, and every app's dev script hardcodes
`--hostname ${DEV_HOSTNAME:-<app>.brand.localhost}`. That's deliberate: `*.brand.localhost` never
reaches production (dev builds are never deployed), and renaming it is a much bigger search-and-replace
than the brand name — every app's `package.json` dev script, `apps/e2e`'s fixtures and `playwright.config.ts`,
and `.devcontainer/devcontainer.json`'s forwarded ports would all need the new hostname kept in sync
with each other, for a string nobody outside your own machine ever sees. Leave it.

## What is not a constant

`BRAND_NAME` only ever supplies a string. These are separate, deliberately not derived from it:

- **The mark.** `BrandMark` in `packages/ui/src/components/brand.tsx` is the logo glyph next to the
  wordmark — swap its SVG, not a string.
- **Icons and manifest colors.** Each app's `src/app/manifest.ts` also sets `background_color` and
  `theme_color` (`#0A0A0A` in every app but `www`, whose `background_color` is `#ffffff`) — pick
  colors that match your actual brand, and swap the icon files the manifest points at.
- **The OG renderer's look.** `ogImage` in `packages/ui/src/lib/og.tsx` draws the OG image's
  layout, type and colors; `BRAND_NAME` only supplies its default `brand` text.
- **Design tokens.** `packages/tokens` — the color scale, spacing and type tokens behind every
  component — is independent of the product name. Retheming is a token edit: change the values in
  `packages/tokens/src/tokens/*.json`, run `bun run tokens` to regenerate
  `packages/ui/src/styles/tokens.generated.css` and `packages/email/src/tokens.generated.ts`
  (committed; `scripts/tokens.test.ts` fails when they lag), and keep the contrast test green. No
  app has a theme file or a colour of its own to change. See `docs/architecture/design-system.md`.
- **`MAIL_FROM` in production.** `apps/api/src/env.ts`'s `DEV_MAIL_FROM` (`${BRAND_NAME} <no-reply@brand.localhost>`)
  is only the fallback outside production. With `MAIL_PROVIDER=smtp` or `resend`, `MAIL_FROM` is a
  required environment variable the api reads as-is — renaming `BRAND_NAME` does not touch it; set
  it yourself alongside the mail provider (see the Authentication section of the root `CLAUDE.md`).
- **Placeholder descriptions.** Every layout's `<meta description>` and manifest `description`
  field, and `apps/www/src/content/home.tsx`'s copy, are generic starter text — rewrite them for
  your product.
- **`/terms` and `/privacy`.** `apps/www/src/content/terms.ts` and `privacy.ts` are template legal
  copy, in Swedish and English, with literal `[Company]` / `[Contact email]` placeholders. They don't read `BRAND_NAME` and
  won't pick up a rename; replace the placeholders and have counsel review before publishing either
  page.

## What to leave

Some things look like the brand but are identifiers for the code, not the product, and changing
them buys you nothing:

- The `@repo/*` package scope (`@repo/ui`, `@repo/sites`, and so on) — internal workspace names,
  never shipped to a user.
- The `boilerplate-bun` / `boilerplate-api` user-agent strings (`apps/api/src/oauth/github.ts`'s
  GitHub OAuth request, `apps/api/src/telemetry/sentry.ts`'s Sentry client tag) — identify your
  server to GitHub and Sentry, not your product to a visitor.
- Package names in every `package.json`, and the directory layout they describe.

If you want to rename the `@repo/*` scope anyway — forking the repo under your own name, say — know
what it actually touches: not just `package.json` `name` fields, but every import across
`apps/*/src` and `packages/*/src`, every `next.config.mjs`'s `transpilePackages`, `apps/story`'s
`vite.config.ts`, `.github/workflows/ci.yml`'s `--filter` lists, both Dockerfiles'
`--filter '@repo/mono'`, and `bun.lock` — well over a thousand tracked files reference `@repo/`.

This guide recommends against it: it's a cosmetic rename of internal identifiers with no runtime
effect, and missing even one reference breaks module resolution or a CI filter silently.
`BRAND_NAME` and `SITE_DOMAIN` are the two things a visitor or search engine can actually see; start
and stop there unless you have a specific reason to go further.

## Check

After editing `BRAND_NAME`:

```bash
bun test scripts        # scripts/brand.test.ts fails if a literal "Boilerplate" remains in src/
bun run ci              # the full local gate: typecheck, tests, build
```

Then a dev pass to see it rendered: `bun dev`, open any app and check the browser tab title and the
footer's `© <year> <name>`. Trigger an email (e.g. sign up on `auth.brand.localhost:3002`, or request
a magic link) and check the api's `mail` log line (`MAIL_PROVIDER` defaults to `log`): its `subject`
and `text` should carry the new name. The sender comes from `MAIL_FROM` (default
`<name> <no-reply@brand.localhost>`), which the log mailer does not print — check it in Mailpit
(`docker compose up`, `localhost:8025`) or with a real provider.
