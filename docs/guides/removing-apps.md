# Removing apps

The starter ships eight Next apps, two Bun services, Storybook and an end-to-end suite. You may not
want all of them. This guide says which can go, and gives the exact edits for each removal. Both
recipes come from real removals done on throwaway branches, run until `bun run ci` and the
Playwright suite passed. Every file listed here was touched in that run, and every failure listed
was hit.

Removing an app from the repo also removes it from production. It needs no DNS record, no container
and no env vars (see [deploying.md](deploying.md), **Topology** and **Run**).

## What can go

| App | Verdict | Why |
|---|---|---|
| `docs`, `help`, `jobs` | **Removable** | Shells nothing else imports. Other apps only link to them through `@repo/sites`. |
| `blog` | **Removable** | Nothing else imports it either, but it is the only app that uses `@repo/content` and the only one in the Playwright suite's `webServer` list — see **Removing `blog`** below, not the Next-shell recipe above. |
| `ai` | **Removable** | Takes `apps/app`'s `/chat` page with it, and the paid feature that gates it. |
| `story` | **Removable** | Tooling: the Storybook site and its tests. Nothing ships from it. |
| `e2e` | **Removable** | Tooling: the Playwright journeys. A PR gate, not shipped. |
| `www` | **Keep or replace** | The other apps link to it (see below). Deleting the folder leaves those links broken. |
| `api`, `auth`, `app`, `account` | **Core** | `api` holds users, sessions and data; `auth` signs users in; `app` is the product; `account` holds billing and workspace management. The api exits at startup without `ACCOUNT_URL`. |

### Replacing `www`

Swap in your own marketing site, or move these pages elsewhere, but keep them reachable. Each of
these assumes `www` serves them:

- **`/terms` and `/privacy`.** Every layout's footer `legal` links point at
  `${siteUrl("www")}/terms` and `/privacy`: `apps/app/src/app/layout.tsx`,
  `apps/auth/src/app/layout.tsx`, `apps/account/src/app/(account)/layout.tsx`, and the shells' layouts.
  The pages themselves are `apps/www/src/app/terms/page.tsx` and `apps/www/src/app/privacy/page.tsx`.
- **The brand link.** Every layout passes `<Brand href={siteUrl("www")} />` to `SiteHeader` and
  `SiteFooter`.
- **The consent banner's privacy link.** Every layout except `www`'s own passes
  `privacyHref={`${siteUrl("www")}/privacy`}` to `CookieConsent`.
- **The waitlist welcome mail.** `apps/api/src/server.ts` builds its link from `siteUrl("www")`.
- **The contact page.** `www`'s `/kontakt` calls `leads.create`, and the lead mails link back to
  `siteUrl("www")` (`leadReceived`'s next step). `www` no longer renders a waitlist form;
  `waitlist.join` is unused by the apps but still served.

If your new site lives at a different host, change those `siteUrl("www")` calls. If it lives at
`www.<your domain>`, leave them, and leave `www` in `SITES` so `siteUrl("www")` still resolves.

## Removing a Next shell

This is the `docs` + `help` + `jobs` removal. To remove only one or two of them, apply the same
edits to just those names.

1. **The folders.** Use `git rm -r apps/docs apps/help apps/jobs` rather than a plain `rm -rf`.
   `scripts/brand.ts`'s `firstPartySources` lists source files with `git ls-files`, and it now skips
   files that are gone from disk. Staging the deletion keeps every `git ls-files` reader honest all
   the same.
2. **`packages/sites/src/index.ts`.** Remove the entries from `SITES`, from `NAV` and from
   `footerGroups`. With all three gone, the footer's **Company** group is empty, so drop the group.
   `NAV` is left with only `"app"`; add your own entries as you build them.
3. **`packages/sites/src/index.test.ts`.** Its examples use `docs` and `help`. Point them at an app
   you kept (the rehearsal used `account`, port 3003). Update the `SITES` key list, the `siteNav`
   list and the footer group titles.
4. **`apps/www/src/views/home-view.tsx`.** The hero's **Read the docs** button calls
   `siteUrl("docs")`, which no longer typechecks. Remove the button. `actions` is then a fragment
   with one child, which Biome reports (`noUselessFragments`), so pass the remaining `Button`
   directly. Search the remaining apps for any other `siteUrl` call naming a removed app.
5. **`scripts/ci-plan.test.ts`.** These tests run against the real workspace graph. The full app
   lists (`NEXT_APPS`, the `@repo/sites` change test's `affected` and `build`, the
   byte-identical-files test's `apps`) come from `SITES`, so step 2 already updated them. What
   still names a shell by hand:
   - "a Next app outside the typecheck gate still builds" uses `apps/jobs`. Point it at a shell you
     kept, or delete the test if none is left.
   - The e2e "docs, help, jobs and docs-only changes leave it off" test: drop the `apps/docs` line.
6. **Compose and containers.**
   - `docker-compose.yml`: remove the service blocks.
   - `docker-compose.dev.yml`: remove the `node_modules` and `.next` volume lines.
   - `.github/workflows/docker-build.yml.disabled`: remove the matrix rows.
   - `.devcontainer/devcontainer.json`: remove the ports from `forwardPorts` and `portsAttributes`.
   - `docker/dev.Dockerfile`: remove them from `EXPOSE`.
7. **CI and ownership.**
   - `.github/workflows/ci.yml`: remove the hostnames from the e2e job's `/etc/hosts` loop. Its
     `DOCKER_MATRIX` names no shell, so it needs no edit.
   - `.github/CODEOWNERS`: remove the lines.
8. **`bun install`.** This rewrites `bun.lock`.

Then run `bun install && bun run ci` and expect exit 0. The rehearsal passed on its first full run
after these edits. The Playwright suite does not drive the shells, and it passed unchanged
(17 tests).

Last, update the prose: `CLAUDE.md`, `README.md`, `LLMS.txt` and
[deploying.md](deploying.md)'s topology all list the eight apps.

### Why some names stay in `@repo/api-contract`

Two schemas still name `docs`, `help` and `jobs`, and they should stay:

- `TELEMETRY_APPS` in `packages/api-contract/src/telemetry.ts`.
- `WaitlistSourceSchema` in `packages/api-contract/src/waitlist.ts`.

The telemetry list types every admin read. `telemetry_errors` keeps rows for 30 days and
`telemetry_vitals` for 7, and `/admin`'s summaries return them through `TelemetryAppSchema`. Drop a
name while its rows exist, and the admin page fails output validation until they age out. The
waitlist `source` is stored with each signup. An unused accepted value costs nothing, and keeping it
means old rows still mean something. The api's tests also use `docs` as a sample value. The same
applies to `"ai"` in `TELEMETRY_APPS` when you remove `ai`.

## Removing `blog`

Unlike `docs`/`help`/`jobs`, `blog` is the only app that imports `@repo/content`, the only one the
Playwright suite starts, and the only one with its own journey spec. This recipe is not rehearsed
end to end the way **Removing a Next shell** and **Removing `ai`** above are — read it as a map of
what to touch, and run `bun run ci` after each step that might catch something the list missed.

1. **The folder.** `git rm -r apps/blog`.
2. **`packages/sites/src/index.ts`.** Remove the `blog` entry from `SITES`, from `NAV` and from
   `footerGroups`'s "Company" group (which becomes `[link("jobs"), link("help")]`). Check
   `packages/sites/src/index.test.ts` for examples that name `blog` and point them at an app you
   kept.
3. **`@repo/content`.** If nothing else uses it (true until F2 brings it to `apps/docs`),
   `git rm -r packages/content` too, and remove `@repo/content` from the root `typecheck` and
   `test:services` `--filter` lists in `package.json`. If F2 has already landed for `apps/docs`,
   keep the package and only drop `apps/blog`'s own dependency on it.
4. **Docker and containers.**
   - `docker-compose.yml`: remove the `blog` service block.
   - `docker-compose.dev.yml`: remove its `node_modules` and `.next` volume lines.
   - `.github/workflows/docker-build.yml.disabled`: remove the matrix row.
   - `.devcontainer/devcontainer.json`: remove port 3009 from `forwardPorts` and
     `portsAttributes`.
   - `docker/dev.Dockerfile`: remove 3009 from `EXPOSE`.
5. **VS Code.** `.vscode/launch.json`: remove the `Next: Blog` and `Chrome: Blog` configs, and
   `blog` from any `Stack: …` compound that lists it. `workspace.code-workspace`: remove the
   `apps/blog` folder entry. `scripts/vscode.test.ts` fails first if either is missed.
6. **CI and ownership.**
   - `.github/workflows/ci.yml`: remove `blog` from the e2e job's `/etc/hosts` loop and from the
     "Build the apps under test" step.
   - `.github/CODEOWNERS`: remove the `/apps/blog/` line, and `/packages/content/` too if you
     removed the package in step 3.
   - `.github/ISSUE_TEMPLATE/`: remove `blog` (and `content`) from the bug/feature templates' area
     lists. `scripts/github.test.ts` fails first if either is missed.
7. **`apps/e2e`.**
   - `apps/e2e/playwright.config.ts`: remove the `next("blog", 3009)` line.
   - `apps/e2e/e2e.env.ts`: remove `URLS.blog`.
   - `apps/e2e/package.json`: drop `--filter @repo/blog` from the `e2e` script.
   - `apps/e2e/tests/blog.spec.ts`: delete it.
   - `apps/e2e/README.md`: fix the test/spec-file counts and drop `blog` from the apps-under-test
     list and the `/etc/hosts` example.
8. **The CI planner.**
   - `scripts/ci-plan.ts`: remove `@repo/blog` from `E2E_TARGETS`.
   - `scripts/ci-plan.test.ts`: remove the case asserting an `apps/blog` change turns `e2e` on
     (and the `dockerRows`/`NEXT_APPS`-derived expectations update themselves, via `SITES`, once
     step 2 is done).
9. **`bun install`**, then re-run `bun run ci` and `cd apps/e2e && CI=1 bunx playwright test`.

Last, update the prose: `CLAUDE.md` (the **Content.** entry and `docs/architecture/content.md` go too, if you dropped
`@repo/content`), `README.md`, `packages/sites/README.md` and `deploying.md`'s topology and app
counts.

## Removing `ai`

1. **The workspaces.** Run `git rm -r apps/ai packages/ai-contract`.
2. **`apps/app`'s chat.**
   - Remove `apps/app/src/app/chat/page.tsx`, `apps/app/src/app/api/chat/route.ts`,
     `apps/app/src/lib/chat-proxy.ts`, `apps/app/src/lib/chat-proxy.test.ts`,
     `apps/app/src/views/chat-view.tsx` and `apps/app/src/views/chat-upsell-view.tsx`.
   - `apps/app/src/views/home-view.tsx`: remove the `/chat` button and the fragment around the one
     that remains, and fix the description.
   - `apps/app/next.config.mjs`: remove `@repo/ai-contract` from `transpilePackages`.
   - `apps/app/package.json`: remove `@ai-sdk/react`, `@repo/ai-contract` and `ai`.
   - `apps/app/.env.example`: remove the `AI_SERVICE_URL` / `AI_SERVICE_TOKEN` block.
3. **`@repo/session`.**
   - In `packages/session/src/env.test.ts`, delete the test "the AI token default is apps/ai's dev
     token" and its `@repo/ai-contract` import.
   - Remove `@repo/ai-contract` from `packages/session/package.json`'s `devDependencies`. That is
     all the package needs to build.
   - To also drop the now-unused keys, remove `AI_SERVICE_URL` / `AI_SERVICE_TOKEN` from `AuthEnv`
     and `DEV_DEFAULTS` and remove `DEV_AI_TOKEN` in `packages/session/src/env.ts`. Then update the
     key lists in `env.test.ts` and the table in `packages/session/README.md`.
4. **The paid feature.** `FEATURES = ["chat", "api"]` in `packages/api-contract/src/billing-plans.ts`
   (re-exported from `billing.ts`) now holds two features: `chat`, which `apps/app`'s chat route
   and page were the only places that gated, and `api` (workspace API keys and `/v1` — see
   CLAUDE.md's **API keys and /v1.** and `docs/guides/api-keys.md`), unrelated to `ai` and
   untouched by removing it. Drop only `chat` from the list, leaving `["api"]` — `Feature` narrows
   to `"api"` instead of becoming `never`, and every `Record<Feature, …>` keeps the `api` key
   rather than becoming `{}`. A feature's words live in one place, `FEATURE_COPY` in
   `packages/api-contract/src/billing.ts` (its label and its upgrade message);
   `FEATURE_MESSAGES`, the account plan picker and `apps/www`'s pricing tiers all derive from it.
   To drop `chat` alone:
   - `packages/api-contract/src/billing-plans.ts`: set `FEATURES = ["api"] as const`.
   - `packages/api-contract/src/billing.ts`: delete `FEATURE_COPY.chat` (keep `FEATURE_COPY.api`).
   - `packages/i18n/messages/<locale>/account.json`: delete `features.chat` in every locale (keep
     `features.api`).
   - `apps/www/src/content/home.tsx`: remove the **AI service** feature card. (There is no API
     access card; that feature reaches the page only through the pricing tiers.)
   - Tests that name `"chat"`:
     - `packages/api-contract/src/billing.test.ts`: the `hasFeature(e, "chat")` assertion.
     - `apps/api/src/billing/billing.test.ts`: the `assertEntitled(chat)` test, and the
       `features: ["chat", "api"]` expectation, which becomes `["api"]`.
     - `packages/session/src/index.test.ts`: the `toContain("chat")` assertion.
     - `apps/www/src/content/home.test.ts`: the tier test's `FEATURE_COPY.chat.label` assertions
       (its `FEATURE_COPY.api.label` ones stay).
     - `apps/account/src/views/workspace-payments.test.tsx`: the plan picker's feature lines lose
       `AI chat` / `AI-chatt` (`Up to 10 members · API access`, and so on).

     This leaves unused imports behind: `hasFeature` in `packages/api-contract/src/billing.test.ts`
     and `assertEntitled` in `apps/api/src/billing/billing.test.ts` were each used only by the
     `chat` assertion you deleted, and Biome fails on an unused import. Remove them, or run
     `bunx biome check --write`.
5. **Root `package.json`.**
   - Remove `ai`, `@ai-sdk/anthropic` and `@ai-sdk/react` from `catalog`.
   - Remove the `dev:ai` script.
   - Remove `--filter @repo/ai --filter @repo/ai-contract` from `typecheck`, and
     `--filter @repo/ai` from `test:services`.
   - Remove the `ai` build output (its `dist` folder) from `clean`.
6. **The CI planner.**
   - `scripts/ci-plan.ts`: remove `@repo/ai` from `E2E_TARGETS`.
   - `scripts/ci-plan.test.ts`:
     - Remove the `ai` row from `dockerRows`.
     - Delete the `ai-contract` test ("a contract change reaches the service that implements it").
     - The service-kit test now expects only `@repo/api` and the `api` image.
     - The `bun-service.Dockerfile` test expects `["api"]`.
     - The Markdown-inside-`src` test points at `apps/ai/src/prompts/system.md`. Point it at
       another workspace's `src/`; the rule itself stays.
     - The `filtersIn` test's `testGate` loses `@repo/ai`.
7. **`.github/workflows/ci.yml`.** Remove the `ai` row from `DOCKER_MATRIX`. It must equal
   `dockerRows` above, and a test compares the two. Remove `ai` from the e2e job's `/etc/hosts`
   loop, and fix the service-tests comment.
8. **`apps/e2e`.**
   - `apps/e2e/playwright.config.ts`: remove the `ai` `webServer` entry and the `aiEnv` import.
   - `apps/e2e/e2e.env.ts`: remove `URLS.ai`, the AI token, the two `AI_SERVICE_*` keys in `shared`,
     and `aiEnv`.
   - `apps/e2e/tests/billing.spec.ts` is the chat journey. The rehearsal kept its mock-upgrade half
     (Pro on `account/payments`) and dropped the two `/chat` visits. The suite stays at 17 tests.
9. **Compose and containers.**
   - `docker-compose.yml`: remove the `ai` service, `app`'s `AI_SERVICE_URL` / `AI_SERVICE_TOKEN`
     and the comment about them, and the header's `app ai` example.
   - `docker-compose.dev.yml`: remove the two `node_modules` volumes and `AI_SERVICE_URL`, and
     change the port range to `3000-3007`.
   - `.github/workflows/docker-build.yml.disabled`: remove the matrix row.
   - `.devcontainer/devcontainer.json`: remove port 3008.
   - `docker/dev.Dockerfile`: remove 3008 from `EXPOSE`.
   - `.env.example`: remove the `apps/ai` block.
   - `.github/CODEOWNERS`: remove the `/apps/ai/` and `/packages/ai-contract/` lines.
10. **`bun install`**, then **`rm -rf apps/app/.next`**. Next writes route types to
    `.next/types` inside `apps/app`, and the typecheck reads them. `bun run ci` typechecks before it
    builds, so a stale `.next` from an earlier build fails with "Cannot find module
    …/src/app/chat/page.js". A fresh CI checkout has no `.next` and never hits this.

Then run `bun install && bun run ci` and expect exit 0. Then run
`cd apps/e2e && CI=1 bunx playwright test`, and expect 17 passed. In the rehearsal, the first `ci`
run failed only in `bun test scripts`, on the two planner tests in step 6 (the Markdown-in-`src`
test and `filtersIn`).

Last, update the prose: `CLAUDE.md`, `README.md`, `LLMS.txt`, `apps/app/README.md`, and the `ai`
rows in [deploying.md](deploying.md). Then sweep for what the steps above missed:

```bash
git grep -n "apps/ai\|ai-contract\|AI_SERVICE" -- ':!docs'
```

Most hits are files the steps above already emptied, deleted or rewrote (`bun install` rewrites
`bun.lock`); what's left is comments naming `apps/ai` in passing — the rehearsal found one in
`.env.example` (a line outside the block step 9 removes) and others in `ci.yml` and test files.
Fix the comments; the command is clean once they're gone.

## Removing `story`

`apps/story` is the Storybook site for `packages/ui` and the `@repo/email` templates. Removing it
touches these places:

- **`.github/workflows/ci.yml`.** Remove the `storybook` job, the slowest check (four shards), and
  take `storybook` out of the final `ci` job's `needs`.
- **The planner.** `scripts/ci-plan.ts` sets the `storybook` output from `has("@repo/story")`. That
  output can go, together with its line in the `changes` job's `outputs` (`ci.yml`) and the two
  places `scripts/ci-plan-run.ts` reads `final.storybook` (the `outputs` object and the job summary
  line) — leaving any of those is inert, not broken, so it's fine to do in a later pass. In
  `scripts/ci-plan.test.ts`, several expectations list `@repo/story` among `affected`, `build` or
  `typecheck` (the sites, email and ui tests), and three tests are about Storybook itself: "MDX is
  code", "Storybook needs tokens' dist/" and "a Storybook config change typechecks and builds only
  the story app".
- **Root `package.json`.** Remove the `story` script, `--filter @repo/story` from the `typecheck`
  list and `apps/story/storybook-static` from `clean`.
  `apps/story` is the only workspace that names `playwright`, so its catalog entry can go too.
- **Elsewhere.** Update `.changeset/config.json`'s `ignore` and `.github/CODEOWNERS`.

The vendored components in `packages/ui` stay. You lose the place to see them, not the components.
The `@repo/story` typecheck gate, which checks stories against their generated declarations, goes
with it.

## Removing `e2e`

`apps/e2e` holds the Playwright journeys. Removing it touches these places:

- **`.github/workflows/ci.yml`.** Remove the `e2e` job (the `/etc/hosts` pinning, the Chromium
  install, the four builds), take `e2e` out of the final `ci` job's `needs`, and drop its line in
  the `changes` job's `outputs`.
- **The planner.** In `scripts/ci-plan.ts`, the `e2e` output and `E2E_TARGETS` can go, together with
  the two places `scripts/ci-plan-run.ts` reads `final.e2e` (the `outputs` object and the job
  summary line) — like `storybook` above, leaving them is inert. In `scripts/ci-plan.test.ts`,
  remove the `e2e` describe block and the `e2e` expectations in the "runs everything" tests.
- **Root `package.json`.** Remove `--filter @repo/e2e` from `typecheck`. `apps/e2e` is the only
  workspace that names `@playwright/test`, so its catalog entry can go too.
- **Elsewhere.** Remove the three `apps/e2e` lines in `.gitignore`.

`MAIL_PROVIDER=file` in the api exists mainly for the suite, but it is harmless to keep. Without
the suite, the cross-app journeys go untested: sign-up to verified workspace, invitations,
impersonation. The unit and api tests stop at one app's boundary.

## Final check

```bash
bun install
bun run ci                                   # planner tests, Biome, both typechecks, service tests, build
cd apps/e2e && CI=1 bunx playwright test     # if you kept apps/e2e
```

`bun run ci` exiting 0 means the planner tests are happy. The planner tests read the real
workspace graph, the root `--filter` lists and the workflow's `DOCKER_MATRIX`, so they are the
check that catches a leftover name. The CI planner then runs only what each later change can
affect, now over the smaller graph.
