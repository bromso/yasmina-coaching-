# Accessibility

Storybook checks components with axe (`@storybook/addon-a11y`); nothing checked the real pages —
composed layouts, forms, error and success states, signed-in menus, dark mode, Swedish copy. The
`e2e` job now does: it fails on any axe WCAG A/AA violation on any page in any theme (and in
Swedish where the app is translated), on a keyboard journey that loses focus, on a page that
scrolls sideways at 320 px, or on animation that ignores `prefers-reduced-motion`. The how and why
of the fixes it already found are in CLAUDE.md's **Accessibility** entry and the commits on
`feat/a11y-pages`; this guide is about running and extending the checks themselves.

## What is checked

| Check | File | What |
|---|---|---|
| Page sweep | `apps/e2e/tests/a11y-pages.spec.ts` | Every manifest entry × its variants, through axe, plus the stale-allowlist test |
| States inside journeys | `apps/e2e/tests/{two-factor,admin,...}.spec.ts` | `expectAccessible` called at a dozen states the sweep never visits (see below) |
| Keyboard-only journeys | `apps/e2e/tests/a11y-keyboard.spec.ts` | Four journeys driven by Tab/Shift+Tab/Enter/Space/Escape/arrows alone |
| Reflow at 320 px | `apps/e2e/tests/a11y-reflow.spec.ts` | Every manifest entry (light only) at a 320 × 640 viewport |
| Reduced motion | `apps/e2e/tests/a11y-motion.spec.ts` | `www /`, a blog post, a docs page, with `reducedMotion: "reduce"` |
| Route coverage | `scripts/a11y.test.ts` (`bun test scripts`) | Every `page.tsx` in the eight Next apps is in the manifest or `EXCLUDED` with a reason |
| Pure logic | `scripts/a11y.test.ts` | `applyAllowlist`, `routeMatches`, `formatViolations` — unit-tested without a browser |

### The axe sweep

`expectAccessible(page, { label, route })` (`apps/e2e/fixtures/a11y.ts`) runs
`@axe-core/playwright` with every WCAG tag through 2.2 A/AA
(`apps/e2e/a11y/core.ts`'s `WCAG_TAGS`: `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`),
whatever the rule's impact. It waits briefly for a non-empty `<title>` first — Next can stream a
dynamic page's metadata a moment after the body, and a page that never gets one still fails axe's
own `document-title` rule — then fails the test, listing every violation (rule id, impact, the
first five failing selectors, axe's help URL) unless the allowlist covers it.

### The manifest

`apps/e2e/a11y/routes.ts`'s `A11Y_PAGES` is the sweep's data: one entry per route, each
`{ app, path, auth: "none" | "user" | "superadmin", variants?, setup? }`. `variantsFor` picks the
default variants — `light` and `dark` everywhere, plus `sv-light` and `sv-dark` on `auth`, `app`
and `account` outside `/admin` (the translated apps; admin pages stay English on purpose). A page
whose real path is only known at run time (an admin user or workspace detail page) takes a
`setup` tag instead of a path; the spec resolves it by following the first link from the matching
list page.

`scripts/a11y.test.ts` enumerates every `apps/*/src/app/**/page.tsx` of the eight Next apps,
turns each into its route pattern (route groups dropped, `[id]` / `[...slug]` / `[[...slug]]`
kept), and fails when one is covered by neither the manifest nor `EXCLUDED`. **Adding a page**
means adding a page to `A11Y_PAGES` (or, if it only redirects, has no content of its own, or is
checked as a state elsewhere, a reasoned entry in `EXCLUDED`) — the test fails with the exact
`<app> <route>` string it's missing, which is also the shape the manifest and `EXCLUDED` entries
take. Forgetting it is `bun test scripts` failing with something like:

```
every page.tsx of the eight Next apps is covered or excluded with a reason
```

naming the uncovered route in the diff.

### States inside journeys

A dozen or so states only render mid-journey — the sign-in error, the two-step verification
step and its QR setup screen, the open user menu, the open mobile nav sheet, the ⌘K/Ctrl K search
dialog, the apply form's field error and confirmation, the contact form's confirmation, the
cookie banner, a settings card's field error, the account deletion banner. These are not in the
manifest; each is a call to `expectAccessible` added to the existing journey spec that already
reaches that state (e.g. `two-factor.spec.ts`, `admin.spec.ts`), right after the test gets there.

## The allowlist

`apps/e2e/a11y.allowlist.json` — an array of `{ rule, route, selector?, reason, state? }`:

- `rule` — the axe rule id (`color-contrast`, `aria-hidden-focus`, …).
- `route` — `<app>:<path>`, matched against what the sweep actually visited; `*` stands for one
  or more characters (`help:/*` covers every help route below the root, but not `help:/` itself —
  that needs its own entry).
- `selector` (optional) — a substring that must appear in the failing node's target; an entry with
  no selector allows the whole rule on that route.
- `reason` — free text a reviewer can judge. "we'll fix this later" is not a reason; "Radix modal
  DropdownMenu sets aria-hidden on content outside the open menu while trapping focus inside it"
  (the one entry today) is.
- `state` (optional, `true`) — marks an entry for a journey state the page sweep never visits, so
  the stale-entry test skips it (the journey spec that reaches the state exercises it).

**An allowed violation is filtered out, not silenced wholesale**: `applyAllowlist` drops only the
nodes an entry covers, so a rule that fails on five elements and is allowed for one still fails on
the other four.

**Stale entries fail the run.** `a11y-pages.spec.ts`'s own test, "every allowlist entry still
matches a violation", loads every manifest page each non-`state` entry's `route` matches (light
variant, the page's sign-in, admin detail pages resolved) and runs axe there; an entry that covers
no violation on any of them — because the underlying issue was fixed, or the route changed — or
that matches no manifest page at all fails the run until it is deleted. It is one self-contained
test, so it holds under a retry or a filtered run alike (it is skipped only when `-g` filters it
out). With today's allowlist (a single `state` entry) it has nothing to check and passes.

**When an entry is acceptable:** third-party internals the app cannot change without forking the
library (Radix's own focus management, for example), reasoned so a reviewer can judge whether the
trade-off still holds. It is never acceptable as a way to silence a violation in first-party
markup — fix that instead.

It holds one entry today, the one above; keeping it short is the goal, not a target to hit.

## Keyboard-only journeys

`a11y-keyboard.spec.ts` drives four journeys with the keyboard alone: signing in, applying for a
job (attaching the CV is the one step set directly through the file input — there is no keyboard
gesture for choosing a file), sending the contact form, and renaming a workspace plus operating
the account menu. Each uses `fixtures/keyboard.ts`'s `tabTo` (Tab/Shift+Tab until the focused
element's accessible name matches, asserting a visible indicator at every stop) and
`expectFocusVisible` (checks a non-`none` `outline-style` with non-zero width, a non-`none`
`box-shadow`, or — inside a `role="menu"`/`role="listbox"`, where the highlighted item is the
indicator — a background that differs from the menu's own). Every dialog or sheet opened on the
way must trap focus, close on Escape and return focus to its trigger; the skip link is the first
stop on every page visited.

## Reflow at 320 px

`a11y-reflow.spec.ts` loads every manifest entry (light theme only, since the viewport is what's
under test, not the theme) at 320 × 640 — the two admin detail pages included, their id resolved
from the list page as the sweep does, and each app's not-found page too — and asserts
`document.documentElement.scrollWidth <= clientWidth` (WCAG 1.4.10). Content inside its own
scroll container — a table, a code block, a chart — is allowed by construction: it does not widen
the document itself.

## Reduced motion

`a11y-motion.spec.ts` opens `www /`, a blog post and a docs page with
`reducedMotion: "reduce"` and asserts `document.getAnimations()` holds no running animation with a
duration over 0 ms after load. A `@repo/ui` component that animates must honour
`prefers-reduced-motion` — `useReducedMotion` from `motion/react`, or the CSS media query — since a
fix there covers every app that renders it.

## Running the sweep for one app

```bash
cd apps/e2e && bunx playwright test tests/a11y-pages.spec.ts -g "axe: help "
```

Narrows to one app's entries by its label prefix (`"<app> <path> <variant>"`); drop the trailing
space to match a path prefix instead. The stale-allowlist check is its own test, so a `-g` filter
on `axe:` leaves it out; run it by name (`-g "every allowlist entry"`) or run the whole file:

```bash
cd apps/e2e && bunx playwright test tests/a11y-pages.spec.ts
```

The keyboard, reflow and motion specs run the same way, by file:

```bash
cd apps/e2e && bunx playwright test tests/a11y-keyboard.spec.ts
cd apps/e2e && bunx playwright test tests/a11y-reflow.spec.ts
cd apps/e2e && bunx playwright test tests/a11y-motion.spec.ts
```

All four need the same build and servers as the rest of the suite — see `apps/e2e/README.md`'s
**Run** section.

## What automation cannot catch

Axe, keyboard simulation and viewport checks cover a subset of WCAG that can be checked by a
script. They do not tell you:

- **Whether a screen reader experience actually makes sense** — the reading order, whether a
  live region announces at the right moment, whether a long form is navigable by headings. Only a
  person using VoiceOver, NVDA or JAWS finds this.
- **Whether alt text and headings are meaningful**, not just present. Axe fails a missing `alt`;
  it cannot tell `alt="image"` from a description that actually helps someone who cannot see the
  image.
- **Cognitive load** — whether instructions are clear, whether an error message says what to do
  next, whether a flow asks for too much at once.

**A short manual checklist** for a new page or component, beyond what CI runs:

- Read it with a screen reader (VoiceOver is built into macOS: Cmd+F5) — does the order make
  sense, does every interactive element announce what it does?
- Does every image's `alt` (or `""` for a decorative one next to visible text) describe the image,
  not just note that one exists?
- Could someone unfamiliar with the product follow the instructions and error messages without
  asking for help?
- Does the page work at 200% browser zoom, not just 320 px CSS width?

## Out of scope

Colour contrast of user-uploaded images (a profile photo, a workspace logo), vendored components
no app renders, PDF/email accessibility, and a full WCAG conformance claim — this checks a subset
automation can reach, not a certification.
