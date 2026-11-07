# Accessibility on pages (Phase 9 A) — design

Phase 9 is production hardening, four sub-projects in order: **A accessibility on pages** (this
spec) → B operations → C load and resilience → D performance budgets (an optional E, security
scanning, may follow). Each is its own spec, plan and PR. Approved in chat on 2026-10-12.

## Intent

Storybook checks components with axe (`@storybook/addon-a11y`); nothing checks the real pages —
composed layouts, forms, error and success states, signed-in menus, dark mode, Swedish copy. A
makes every page in the eight Next apps pass WCAG 2.2 AA as far as automation can tell, keeps it
that way in CI, and fixes what the checks find. Success: the e2e job fails on any axe WCAG A/AA
violation on any page in any theme (and in Swedish where the app is translated), on a keyboard
journey that loses focus, on a page that scrolls sideways at 320 px, or on animation that ignores
`prefers-reduced-motion`; and it passes today, with an empty allowlist or every entry reasoned.

Decided with the owner: **fail on every axe WCAG 2.0/2.1/2.2 A and AA rule, whatever its impact**,
with a reviewed allowlist for what cannot be fixed now; **a route-manifest sweep plus checks inside
the existing journeys** (option 3); and four extra checks — **keyboard-only journeys, dark mode +
Swedish, reflow at 320 px, reduced motion**.

## 1. Tooling (`apps/e2e`)

- `@axe-core/playwright`, declared in `apps/e2e` only, with a literal range (workspace-specific,
  dependency rule 3).
- `fixtures/a11y.ts` — `expectAccessible(page, { label })`: runs axe with tags `wcag2a`, `wcag2aa`,
  `wcag21a`, `wcag21aa`, `wcag22aa`; fails listing each violation as rule id, impact, the first
  failing selectors and axe's help URL, prefixed by `label` (e.g. `account /security dark sv`).
- `apps/e2e/a11y.allowlist.json` — entries `{ rule, route, selector?, reason }` (`route` a path
  pattern on one app, e.g. `account:/security`). An allowed violation is filtered out; an entry
  that matched nothing in a full run fails that run (no stale entries — checked by an
  `afterAll` over the entries the run touched, only when the whole sweep ran). Starts `[]`;
  every entry carries a reason a reviewer can judge.
- Variants: dark through `page.emulateMedia({ colorScheme: "dark" })` (every app's theme defaults
  to `system`); Swedish through the `locale=sv` cookie on `COOKIE_DOMAIN` before navigation.

## 2. The sweep

- `apps/e2e/a11y.routes.ts` — the manifest: `{ app, path, auth: "none" | "user" | "superadmin",
  variants?, setup?, label? }`. Default variants: `light`, `dark`; plus `sv-light`, `sv-dark` for
  `auth`, `app` and `account` (the translated apps). `setup` creates what a page needs to render
  its real content (a note, a pending invitation, a job application, a support request, a ready
  data export) through the api or the UI helpers in `fixtures/`.
- Content apps (`docs`, `help`, `jobs`, `blog`): every listing route plus one representative page
  per template — a docs page with a table of contents, a help category and article, an open and a
  closed job posting and its apply page, a blog post, a tag and an author page, `/all` where it
  exists. Pages of one template share their markup; content is checked by the content gates.
- `tests/a11y-pages.spec.ts` — one test per entry × variant. Signed-in roles authenticate once
  per worker-file and reuse the storage state (`user`: a verified account with a workspace and a
  note; `superadmin`: the e2e superadmin from `ensureAdmin`).
- `scripts/a11y-routes.test.ts` (in `bun test scripts`) — enumerates every
  `apps/<app>/src/app/**/page.tsx` of the eight Next apps, turns each into its route pattern
  (route groups dropped, `[param]` / `[...slug]` / `[[...slug]]` kept as patterns), and fails when
  a route is neither covered by a manifest entry nor listed in the manifest's `excluded` with a
  reason (e.g. a page that only redirects). The manifest lives where `bun test scripts` can import
  it without installing Playwright (plain data, no Playwright import).

## 3. States, keyboard, reflow, motion

- **States inside journeys:** `expectAccessible` at the states only a journey reaches, about a
  dozen: the sign-in error, the two-step verification step, two-step setup's QR step, the user menu
  open, the mobile navigation sheet open, the ⌘K search dialog open (docs, help), the apply form
  with a field error and its confirmation, the contact form's confirmation, the cookie banner,
  a settings card showing a field error, the account deletion banner.
- **`tests/a11y-keyboard.spec.ts`** — four journeys with the keyboard only (Tab, Shift+Tab, Enter,
  Space, Escape, arrow keys where a widget needs them): sign in; apply for a role (attaching the CV
  is the one non-keyboard step, set through the input); send the contact form; rename the
  workspace. Each asserts every control it needs is reachable in order, the focused element always
  shows a visible indicator (computed `outline-style` not `none` with non-zero width, or a non-
  `none` `box-shadow`), and every dialog or sheet opened on the way traps focus, closes on Escape
  and returns focus to its trigger. The skip link is the first stop on every page visited.
- **`tests/a11y-reflow.spec.ts`** — every manifest entry (light only) at a 320 × 640 viewport:
  `document.documentElement.scrollWidth <= clientWidth`. Content inside its own scroll container
  (tables, code blocks, charts) is allowed by construction, since it does not widen the document.
- **`tests/a11y-motion.spec.ts`** — with `reducedMotion: "reduce"`, on `www /`, a blog post and a
  docs page: after load, `document.getAnimations()` holds no running animation with a duration over
  0 ms, and no element animated by `motion` keeps transforming. Components in `@repo/ui` that the
  apps render and that animate without honouring `prefers-reduced-motion` gain that guard
  (`useReducedMotion` from `motion/react`, or the CSS media query).

## 4. Fixing, CI, docs

- Fixes land where the problem lives — usually a shared `@repo/ui` component or block, so every app
  is fixed at once; an app-local fix only for app-local markup. A component fix gets a Storybook
  story or unit test showing the corrected markup when practical. The plan runs the sweep first,
  triages, and batches fixes by cause.
- The vendored-component boundary is unchanged; a vendored component an app actually renders is
  fixed like any other (the a11y lint rules already apply to it).
- CI: the new specs run in the existing `e2e` job (no new job, no `ci-plan` change); CLAUDE.md's
  and `apps/e2e/README.md`'s test and spec-file counts are updated.
- Docs: `docs/guides/accessibility.md` (what is checked, adding a page to the manifest, the
  allowlist rules, running one app's sweep, what automation cannot catch); a CLAUDE.md
  **Accessibility** single point; `apps/e2e/README.md`; the ROADMAP gains Phase 9 (A–D, E
  optional) with A ticked on merge.

## Testing

- `scripts/a11y-routes.test.ts` itself: a fixture tree with a route missing from the manifest
  fails, an excluded route with a reason passes, route groups and dynamic segments map correctly.
- `fixtures/a11y.ts`: unit-tested formatting and allowlist matching (stale-entry detection
  included) with axe result objects, without a browser.
- The sweep, keyboard, reflow and motion specs are the e2e checks themselves; each new check is
  shown to fail once against a deliberately broken page before the fix that makes it pass (noted in
  the PR).

## Out of scope

Screen-reader testing (needs humans; the guide says so), colour contrast of user-uploaded images,
vendored components no app renders, PDF/email accessibility, and a full WCAG conformance claim —
automation catches a subset; the guide states which.
