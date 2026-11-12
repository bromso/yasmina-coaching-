# One look for every app: the coaching design system, global

## Intent
Yasmina Petersson's site is eight Next apps:
- **Public:** www, blog, docs, help and jobs.
- **Signed-in:** auth, app and account.

All of them will be used. Today only www and the blog look like her brand:
- **Palette:** warm cream and charcoal, with soft "sun" yellow accents.
- **Type:** Fraunces display headings.
- **Shapes:** rounded cards and pill buttons.
- **Chrome:** www's header and footer.

That look lives in an opt-in stylesheet (`packages/ui/src/styles/themes/coaching.css`), which only those two apps import, plus local CSS and components inside `apps/www` and `apps/blog`. Sign-in, app, account, docs, help and jobs still look like the original boilerplate. The user wants:
- **One look:** every app looks like www and the blog.
- **Global styling only:** changed globally, through the boilerplate's own layering (tokens → components → blocks → views → pages).
- **No local styling:** no app-level styles.

## Goals
1. **One visual identity across all eight apps:**
   - www's palette, light and dark;
   - fonts: Fraunces for display headings, the existing sans for body text;
   - radii, shadows, focus styles;
   - the header and footer style;
   - cards, buttons, form controls, and the "eyebrow" and section-heading treatment.
2. **One source of truth for design tokens, consumed by everything.**
   - Changing a colour, radius or font in one place changes it in every app, in Storybook and in emails where it applies.
   - No token value may be defined twice.
3. **No app-level styling.**
   - Every `apps/*/src/styles/globals.css` is reduced to the shared import, plus only what is truly app-specific behaviour, documented line by line. One example is the blog's `<source>` rule, which belongs global anyway.
   - No colour, font or radius literals in app code; Tailwind utilities that reference tokens are fine.
   - The look-defining pieces that live in www and the blog today move into `packages/ui` as components or blocks. That covers the header shell, footer, sun panel or card, eyebrow, display heading, hero layout primitives and the `picture > source` rule. They are then used by every app.
4. **The boilerplate's guarantees keep holding:**
   - WCAG contrast (`contrast.test.ts` keeps checking every pair, against the single source);
   - axe across every app;
   - 320 px reflow;
   - reduced motion;
   - static apps stay static;
   - bundle budgets;
   - Storybook shows the new look and remains the visual reference.

## Non-goals
- No new copy, pages or features. App content stays app-specific:
  - www's "Utforska" carousel menu;
  - the docs sidebar and search;
  - admin tables;
  - the account settings layout.
- No redesign of the denser screens. The admin, account and auth forms keep their layouts but adopt the palette, type and components. They get no marketing hero sections.
- No change to the brand name, logo mark or photography.

## Anti-goals (a failure even if it technically works)
- The coaching look still applied per app: an app that has to import a theme, or override tokens, to look right.
- Token values duplicated between `packages/tokens` and `packages/ui` and allowed to drift.
- www or the blog looking different from before the change, apart from deliberate unification. Their rendered result is the reference.
- Contrast regressions, or new axe violations, in any app or in dark mode.
- A static app becoming dynamic, or a bundle budget raised without a reviewed reason.

## Decided
- **The target look** is `apps/www` and `apps/blog` as they are today.
- **Scope:** all eight Next apps, plus Storybook. The `@repo/email` templates adopt the palette and fonts where email clients allow it.
- **Layering:** follow the boilerplate pattern: tokens → components → blocks → views → pages. Apps compose; they do not style.

## Constraints
- **Two token homes today:**
  - `packages/tokens`: style-dictionary JSON in `src/tokens/*.json`, built to `dist/css|js|ts|json`, consumed only by `apps/story`.
  - `packages/ui/src/styles/globals.css`: hand-written `oklch()` CSS variables that every app imports.

  The builder must pick one as the source and derive the other, or retire one. Whichever is kept is documented in CLAUDE.md's **Design System Single Points**, and the contrast test reads the real source.
- **Fonts** come from `@repo/ui/lib/fonts`. `fontDisplay` (Fraunces) must be applied in every root layout through the shared pattern, not per app.
- **Header and footer:**
  - `@repo/ui/blocks/site-header` and `site-footer` are the shared blocks.
  - www uses its own `ExploreNav` and the blog its own `BlogHeader`.
  - The look of www's header becomes the shared block's look. www's carousel may stay www-specific content inside the shared shell.
- **Gates:** `scripts/*.test.ts` checks every app's layout, PWA, a11y manifest, CLAUDE.md size and client imports, and must keep passing.
- **CI minutes are limited.** Verify the full CI suite locally before any push (`bun run ci`, Storybook, builds, bundle budgets, e2e, load), then push once.

## Left to the builder
- Which token home becomes the source, and how the other is derived (generate CSS from style-dictionary, or generate JSON from the CSS).
- How to split www and blog local pieces into components versus blocks, and their names.
- How each signed-in app's layout adopts the shared header and footer without losing its controls (the session-aware `UserMenu`, notification bell, locale and theme).
- Visual regression method. Before/after screenshots of www and blog pages are required, either a Playwright screenshot comparison or a reviewed set.

## Calls made after the builder check (the controller's, not the user's — revisit if wrong)
1. **Reach in the dense apps.** The same global rules apply everywhere, as www has them today:
   - `h1`–`h2` (and section titles) in Fraunces via base element styles;
   - the shared `Button`, `Input`, `Card`, `Badge` and similar variants take www's radii and pill shapes in `packages/ui`.

   Tables, admin forms and settings keep their layout and density, but are built from those same components. No per-app exceptions.

   Vendored components (`animate-ui`, `magicui`, `charts`) pick up tokens through the CSS variables only. They are not hand-restyled, because the vendored boundary stays as CLAUDE.md describes it.
2. **Button colours** follow www:
   - The default `Button` is the charcoal `--primary`.
   - `--brand-blue` stays a separate token for the single primary call to action per screen, which www already uses, and for the focus ring.
   - Secondary, ghost and destructive variants keep their roles with the coaching palette.
   - `contrast.test.ts` covers every pair this produces.
3. **Header.**
   - One shared header design, www's pill-style shell, in `@repo/ui/blocks/site-header`.
   - Each app passes its own links and controls through props: www its "Utforska"/"Boka" and carousel, the blog its language link and Boka, the signed-in apps their user menu, bell, locale and theme.
   - The cross-app nav (`siteNav`) remains available as one of those slots, not forced on www.
   - `BlogHeader` becomes a thin caller of the shared block. The footer works the same way.
4. **Regression tolerance.**
   - www and the blog must look the same as before. Screenshot comparison of a fixed page set in light and dark at 320 and 1280 px, with a pixel-diff threshold of 0.1 % per page, is reviewed by the controller.
   - Any intended change (header and footer unification) is listed with before/after images.
5. **The boilerplate palette is replaced outright.** The coaching values become the only `:root` and `.dark` values, and no selectable theme remains.

   `packages/tokens` (style-dictionary) becomes the single source:
   - It emits the CSS variables `packages/ui` imports, keeping `oklch()`.
   - It also emits sRGB hex for emails.
   - `contrast.test.ts` reads the generated output.

   The hand-written values in `globals.css` and `coaching.css` are removed.
6. **Emails** take the palette as generated hex and headings in `Georgia, serif` as the Fraunces fallback, since web fonts are unreliable in mail. A test checks that the email constants equal the token build.
7. **Motion.** www's `rise` and `ring-pulse` keyframes and the easing token become global design-system tokens in `packages/ui`, motion-safe only. Breakpoints and the typography plugin move global too. Nothing app-specific remains in www's `globals.css` unless it is documented as behaviour, not look.
8. **Fonts and budgets.**
   - Fraunces is applied in every root layout through the shared `@repo/ui/lib/fonts` pattern: `next/font`, self-hosted, subset to Latin.
   - Font files are not first-load JS, so the bundle budgets should not move. If a JS budget does move, it is re-measured with `perf:update` for that route only and the reason is stated in the commit.
   - The private service worker already caches fonts.
