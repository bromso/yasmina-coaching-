# One Look for Every App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Next app renders the coaching look of `apps/www` and `apps/blog`, sourced from one global token set and shared `@repo/ui` pieces, with no app-level styling.

**Architecture:**
- `packages/tokens` (style-dictionary) becomes the single source. Its build generates two committed files:
  - a CSS theme file that `packages/ui/src/styles/globals.css` imports;
  - a hex constants file for `@repo/email`.

  A drift test fails if either is stale, following the repo's "generate, commit, drift-test" pattern (`generate:api` / `generate:vendored-types`).
- Everything in www's and blog's `globals.css`, plus the look-defining www and blog components, moves into `packages/ui`. Every app's `globals.css` shrinks to one import, and a scripts test enforces that.

**Tech Stack:** style-dictionary 5, Tailwind v4 (`@theme inline`), shadcn/Radix components in `@repo/ui`, Next 16, Playwright (screenshot comparison), bun test.

**Spec:** `docs/superpowers/specs/2026-11-11-global-design-system-design.md`. Read its "Calls made after the builder check" section; those calls are binding.

## Global Constraints
- **Target look:** `apps/www` and `apps/blog` as rendered before Task 1 (the baseline from Task 0).
- **Token source:** `packages/tokens` is the only place a token value is written. No `oklch(`/`#hex` colour literal may appear in `packages/ui/src/styles/*.css` outside the generated file, nor in `apps/*/src/**/*.{css,tsx}`.
- **App stylesheets:** every `apps/*/src/styles/globals.css` is exactly `@import "@repo/ui/globals.css";`, with an optional one-line comment. No other rules.
- **Fonts:** Fraunces is the display face in every app via `@repo/ui/lib/fonts`. The body face is unchanged.
- **Palette:** the boilerplate palette is removed. Coaching values are the only `:root`/`.dark` values. `coaching.css` is deleted.
- **Contrast:** `contrast.test.ts` keeps passing and reads the generated theme.
- **Dark mode:** must stay equivalent to today's coaching dark values.
- **Motion:** stays `motion-safe` only.
- **Static apps:** www, docs, help, jobs and blog stay static where they are static today (○/●).
- **Bundle budgets:** not raised, except for a single route via `perf:update` with the reason stated in the commit.
- **CI minutes are limited:** nothing is pushed until the controller has run the full CI suite locally (`bun run ci`, Storybook, builds, bundle budgets, e2e, load). Then it is pushed once.
- **Branch:** `feature/design-system`, created from `feature/contact` (PR #9, which reworked the language menu in `@repo/ui`). When #9 merges, merge `main` into this branch and open its PR against `main` directly; never a stacked PR.
- **Commits:** Conventional Commits ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Ports:** never start, stop or kill anything on ports 3000–3009 except servers you started yourself in a scratchpad worktree.

## Review Focus
1. **Dark mode in every app.** A token that only had a light value in www (for example `--sun-soft`) must have its dark twin in the generated theme. Task 1's test asserts that every `:root` variable has a `.dark` counterpart.
2. **Signed-in app chrome under the new header.** The user menu, notification bell, locale menu and theme toggle must still fit at 320 px. Task 4 runs `a11y-reflow` for app, auth and account.
3. **Forced-colors and high-contrast users.** www's `@media (forced-colors)` and `(prefers-contrast: high)` rules must apply in every app once global. Task 2 adds a Storybook or unit check that the rules exist in the shared stylesheet.
4. **The Docs sidebar and search dialog.** Popover and card tokens change for fumadocs-based apps. Task 6 includes axe runs for docs, help and jobs in light and dark.
5. **Emails in dark-mode mail clients.** Generated hex values must keep the 4.5:1 text pairs on white and cream. Task 7 tests the contrast of the email pairs.

---

### Task 0: Visual baseline of www and blog (before any change)

**Files:**
- Create: `apps/e2e/tests/visual.spec.ts`, `apps/e2e/visual/pages.ts`.
- Create: snapshots under `apps/e2e/tests/visual.spec.ts-snapshots/`, committed.

**Interfaces:**
- Produces: `VISUAL_PAGES`, a list of `{ app, path, name }` covering:
  - www: `/`, `/book`, `/book/inner_start_coaching`, `/inifran`, `/inifran/coachning`, `/kontakt`, `/privacy`;
  - blog: `/`, `/att-leda-genom-en-kris`, `/en`.

  Plus a spec that screenshots each page in light and dark at 320 and 1280 px with `toHaveScreenshot({ fullPage: true, maxDiffPixelRatio: 0.001, animations: "disabled" })`.

- [ ] **Step 1:** Write `visual.spec.ts`:
  - Wait for fonts (`document.fonts.ready`) and finite animations, the same way as `fixtures/a11y.ts`.
  - Mask the hero `<video>` and any time-dependent element, such as the calendar's month or today's date.
- [ ] **Step 2:** Generate baselines on unchanged code in a scratchpad worktree with production builds (`CI=1`, `--update-snapshots`), then run once more without the flag. Expected: all pass.
- [ ] **Step 3:** Commit: `test(e2e): visual baseline of www and blog before the global design system`.

### Task 1: `packages/tokens` is the single source; it generates the theme

**Files:**
- Modify: `packages/tokens/src/tokens/{color,typography,spacing,shadow}.json`.
- Create: `packages/tokens/src/tokens/{radius,motion}.json`.
- Modify: `packages/tokens/sd.config.js`.
- Create: `packages/ui/src/styles/tokens.generated.css`.
- Create: `packages/email/src/tokens.generated.ts`.
- Modify: `packages/ui/src/styles/globals.css` (remove every hand-written token value; `@import "./tokens.generated.css"`).
- Delete: `packages/ui/src/styles/themes/coaching.css` and its export in `packages/ui/package.json`.
- Modify: `packages/ui/src/styles/contrast.test.ts` (read the generated file).
- Test: `packages/tokens/src/tokens.test.ts`, `scripts/tokens.test.ts` (drift check).

**Interfaces:**
- Produces:
  - `tokens.generated.css`, containing `:root { … }` and `.dark { … }` with exactly the variable names `globals.css` and `coaching.css` define today: `--background` … `--ring`, `--radius`, `--chart-*`, `--sidebar-*`, `--brand-blue(-foreground)`, `--sun`, `--sun-soft`, `--display-family`, `--text-family`, `--display-weight`, `--text-weight`, `--ease-out-soft`, shadows, and any spacing tokens in use. The values are the coaching values, and the boilerplate values are dropped.
  - `export const EMAIL_COLORS: Record<"background"|"foreground"|"muted"|"mutedForeground"|"primary"|"primaryForeground"|"border"|"brandBlue"|"sun"|"sunSoft", string>` (sRGB hex) in `tokens.generated.ts`.
  - `export const EMAIL_FONTS = { display: "Georgia, 'Times New Roman', serif", body: <system sans stack> }`.
- Root script: `bun run tokens`, i.e. `bun --filter @repo/tokens build`, which writes both generated files.

- [ ] **Step 1: Failing tests** in `packages/tokens/src/tokens.test.ts`:
  - Every `:root` variable in the generated CSS has a `.dark` counterpart, except a documented list of mode-independent ones (`--radius`, fonts, easing).
  - `--background` light equals `oklch(0.985 0.008 90)`.
  - `--radius` equals `0.875rem`.
  - `EMAIL_COLORS.background` equals the sRGB hex of `oklch(0.985 0.008 90)`. Compute it with the converter in `contrast.test.ts`, moved to a shared helper.
- [ ] **Step 2: Drift test** in `scripts/tokens.test.ts`: running the generator into memory equals the committed `tokens.generated.css` and `tokens.generated.ts`; the failure message names `bun run tokens`.
- [ ] **Step 3:** Run both; expect FAIL.
- [ ] **Step 4: Implement.**
  - Move the coaching values (light and dark) from `coaching.css` into the token JSON.
  - Add a custom style-dictionary format emitting `:root`/`.dark` (light and dark sets in the JSON) and one emitting the email constants. Keep `oklch()` in CSS, and convert to hex only for email.
  - Keep the existing `dist/*` outputs if Storybook uses them, otherwise remove them, and say which in the commit.
  - Wire `globals.css` to import the generated file.
  - Remove `coaching.css` and its imports from www and blog.
- [ ] **Step 5: Run checks.** Run `bun test packages/tokens packages/ui scripts/tokens.test.ts` and `bun --filter @repo/ui typecheck`. Expected: PASS, including `contrast.test.ts`.
- [ ] **Step 6: Commit:** `feat(tokens): the coaching look is the one token set, generated for CSS and email`.

### Task 2: Global base styles; every app stylesheet is one import

**Files:**
- Modify: `packages/ui/src/styles/globals.css`. It takes from `apps/www/src/styles/globals.css` and `apps/blog/src/styles/globals.css`:
  - breakpoints, `--animate-rise`, `--animate-ring-pulse` and their keyframes;
  - the `@plugin "@tailwindcss/typography"`;
  - the `@layer components` rules;
  - the forced-colors and prefers-contrast blocks;
  - `html { scroll-padding-top: 6rem }`;
  - `picture > source { display: none }`;
  - the `h1`/`h2` display-font base rule.
- Modify: `apps/*/src/styles/globals.css`, all eight, so each is the single import.
- Modify: every root layout's `<body>` className to use a new `fontVariables` from `@repo/ui/lib/fonts`, including both blog route-group layouts.
- Test: `scripts/app-styles.test.ts`.

**Interfaces:**
- Produces: `export const fontVariables: string` in `packages/ui/src/lib/fonts.ts` (`${fontSans.variable} ${fontDisplay.variable}`).

- [ ] **Step 1: Failing test** in `scripts/app-styles.test.ts`:
  - For each `apps/<next app>/src/styles/globals.css`, the file, without comments and whitespace, equals `@import "@repo/ui/globals.css";`.
  - Each `apps/<next app>/src/app/**/layout.tsx` that renders `<body>` uses `fontVariables`.
  - No `apps/*/src/**/*.{tsx,css}` contains `oklch(` or a 3/6-digit hex colour literal. Allowlist: `public/`, `manifest.ts` `theme_color` and the OG images, each with a reason.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Move the rules. Delete what becomes dead. Replace literal colours found by the test with tokens.
- [ ] **Step 4: Run checks.**
  - Run `bun test scripts`, `bunx biome ci .` and the `apps/www` and `apps/blog` tests.
  - Run the Task 0 visual spec. Expected: www and blog have 0 diffs.
  - Screenshot each other app's home and sign-in pages into `scratchpad/visual-review/` for the controller.
- [ ] **Step 5: Commit:** `refactor(ui): every app's stylesheet is the shared one; www and blog rules made global`.

### Task 3: Look-defining components move to `@repo/ui`

**Files:**
- Create in `packages/ui/src/components/`, moved and generalised from www and blog:
  - `eyebrow.tsx`, `arrow-link.tsx`, `dashed-line.tsx`, `picture.tsx` (takes a generic `{ name, width, height, small, alt }` image and a `basePath`, default `/media`);
  - `sun-panel.tsx`, the rounded `bg-sun-soft` card used by www and blog CTAs and teasers;
  - `display-heading.tsx`, if a heading component is still needed after Task 2's base rule;
  - `background.tsx`.
  - Also the `motion/reveal` and `media-clip` client islands, into `packages/ui/src/components/motion/`.
- Modify: www and blog imports, then delete their local copies.
- Modify: `packages/ui/src/components/button.tsx`, `input.tsx`, `card.tsx`, `badge.tsx` and `select.tsx` defaults to www's shapes. Read www's actual classNames: pills on buttons via `rounded-full`, `rounded-4xl` cards. After that, www and blog callers drop their now-redundant className overrides.
- Stories: `apps/story/stories/` for each new component, plus updated Button, Card and Input stories.
- Tests: `packages/ui/src/components/*.test.tsx` for the moved components (render, props, a11y names).

**Interfaces:**
- Produces: `Eyebrow`, `ArrowLink`, `DashedLine`, `Picture`, `SunPanel`, `Background`, `Reveal`, `MediaClip`, with the same prop names as the www originals, so call sites only change their import path.

- [ ] **Step 1: Failing tests** for each moved component in `packages/ui`: they render with their www props, and `Picture` builds webp and jpg sources from `basePath`.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3:** Move, generalise and update imports. Change the component defaults and remove redundant overrides.
- [ ] **Step 4: Run checks.** Run `bun test packages/ui apps/www apps/blog`, the Storybook tests for the touched stories, and the Task 0 visual spec (expected: 0 diffs).
- [ ] **Step 5: Commit:** `refactor(ui): www's look-defining components are shared`.

### Task 4: One header shell for every app

**Files:**
- Modify: `packages/ui/src/blocks/site-header.tsx` and `site-header-mobile.tsx`. Adopt www's pill header look from `apps/www/src/components/site-nav/explore-nav-bar.tsx`:
  - the rounded bordered bar, background, spacing and brand text;
  - slot API kept: `brand`, `links`, `start`, `controls`, `end`, `sticky`;
  - new optional `nav` slot for app-specific navigation, such as www's carousel trigger.
- Modify: `apps/www/src/components/site-nav/*` to render inside `SiteHeader` (shell) with its own content. Modify `apps/blog/src/components/blog-header.tsx` to be a thin `SiteHeader` caller.
- Modify: layouts of app, auth, account, docs, help and jobs. They already use `SiteHeader`; check they need no local classes.
- Tests: `packages/ui/src/blocks/site-header.test.tsx`, the SiteHeader stories (including `Narrow`), and the e2e `a11y-reflow`, `a11y-keyboard` and `i18n` specs.

- [ ] **Step 1: Failing test:** `SiteHeader` renders www's shell classes (rounded bar, `bg-background/…`) and the `nav` slot; existing slot tests still pass.
- [ ] **Step 2:** Implement and migrate callers.
- [ ] **Step 3: Run checks.**
  - Run the Storybook SiteHeader and LocaleSwitcher stories.
  - Run e2e `a11y-reflow`, `a11y-keyboard`, `i18n` and `www` for every app (scratchpad worktree, production builds).
  - Run the Task 0 visual spec. Expected: www and blog have 0 diffs, or each diff is listed as intended header unification with before and after images in `scratchpad/visual-review/` and the baseline updated in this commit with the reason.
- [ ] **Step 4: Commit:** `feat(ui): one header shell for every app, in www's look`.

### Task 5: One footer for every app

**Files:**
- Modify: `packages/ui/src/blocks/site-footer.tsx` to take www's footer look.
- Modify: the www and blog footer callers, and the other six layouts, to drop local footer styling.
- Tests: `site-footer.test.tsx` and stories. Also run the Task 0 spec.

- [ ] Same step pattern as Task 4. Commit: `feat(ui): one footer for every app, in www's look`.

### Task 6: Signed-in and content apps adopt the look

**Files:**
- Modify: the views and components in app, auth (including `/admin/**`), account, docs, help and jobs that hard-code boilerplate look. Find them by grepping for `bg-zinc`, `bg-gray`, `text-slate`, `rounded-md` on cards, and explicit colours or fonts. Replace them with the shared components and tokens.
- Do not change layouts or density.
- Fumadocs-based docs, help and jobs: map fumadocs CSS variables (`--color-fd-*`) to the tokens in the shared stylesheet, not per app.
- Tests: the existing app tests. Add axe and reflow e2e for the docs, help and jobs pages in light and dark (`a11y/routes.ts` variants), and Storybook for touched components.

- [ ] **Step 1:** Screenshot the current state of each app's key pages (home or sign-in, `/admin/bookings`, `/admin/leads`, account security, a docs page, help, jobs) into `scratchpad/visual-review/before/`.
- [ ] **Step 2:** Replace local look code with shared components and tokens. Map the fumadocs variables globally.
- [ ] **Step 3: Run checks.**
  - Run `bun test` for each touched app and `bun test scripts` (the Task 2 test).
  - Run e2e `a11y-pages`, `a11y-reflow` and `a11y-motion` for all apps.
  - Save after-screenshots to `scratchpad/visual-review/after/` for the controller.
- [ ] **Step 4: Commit:** `feat: app, auth, account, docs, help and jobs take the coaching look`.

### Task 7: Emails use the token palette

**Files:**
- Modify: `packages/email/src/` layout and components to read `EMAIL_COLORS` and `EMAIL_FONTS` from Task 1. Remove every literal colour.
- Tests: `packages/email` tests: no hex literal outside the generated file; every text and background pair clears 4.5:1 (reuse the shared contrast helper); the email stories render.

- [ ] Write the failing tests, implement, run `bun --filter @repo/email test` and the Storybook email stories. Commit: `feat(email): mails take the coaching palette from the tokens`.

### Task 8: Docs and guardrails

**Files:**
- Modify: `CLAUDE.md` **Design System Single Points**: tokens source, generated files, `bun run tokens`, the one-import rule and `fontVariables`. Keep `scripts/claude-md.test.ts` green.
- Modify: `packages/ui/README.md`, `packages/tokens/README.md` (create if missing), `docs/guides/renaming-the-brand.md` (retheming is now a token edit) and the `apps/www`/`apps/blog` READMEs.

- [ ] Update the docs, run `bun test scripts`, and commit: `docs: one token source and one stylesheet for every app`.

### Task 9 (controller): Full local verification, then one push

- [ ] In a scratchpad worktree at the branch head, run every check in order:
  1. `bun install --frozen-lockfile`
  2. `bun run ci`
  3. Storybook (`bunx playwright install chromium` first)
  4. the builds of the eight apps
  5. `bun scripts/bundle-budget.ts …`
  6. e2e with `CI=true`, including `visual.spec.ts`
  7. the load smoke
- [ ] Review the `scratchpad/visual-review/` before and after sets.
- [ ] Merge `main` if #9 has merged, re-run what the merge affects, then push once and open the PR against `main`.
