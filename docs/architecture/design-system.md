# Design system

One look for every app: the coaching look (cream, charcoal, one blue, a yellow "sun", Fraunces
headlines). It has one source, one stylesheet and one set of components. This is the full
reference behind **Design System Single Points** in `CLAUDE.md`.

## Tokens: one source, two generated files

`packages/tokens/src/tokens/*.json` (`color`, `radius`, `shadow`, `spacing`, `typography`, `motion`,
`layer`, `site-header`) are the only place a value is written. A colour carries its dark value in
`$extensions.mode.dark`. `bun run tokens` (root
script, `bun --filter @repo/tokens build`, which runs `bun sd.config.js`) generates:

- `packages/ui/src/styles/tokens.generated.css`: every token as a CSS variable, `:root` for light,
  `.dark` for dark, colours kept in `oklch()`;
- `packages/email/src/tokens.generated.ts`: the light palette as sRGB hex plus the mail fonts
  (mail clients read neither `oklch()` nor web fonts reliably);
- `packages/tokens/dist/json`, uncommitted, only for Storybook (`@repo/tokens/json`).

Both generated files are committed, so no typecheck, test or build waits on the tokens build, and
neither is edited by hand. `scripts/tokens.test.ts` renders the tokens in memory and fails when a
committed file differs, so a token edit that skipped `bun run tokens` fails `bun test scripts`.
The writer only touches a file whose content changed. `@repo/tokens/color` (`oklchToRgb`,
`contrast`, `toHex`, …) is the one colour implementation: the email hex values and
`packages/ui`'s `contrast.test.ts` both use it.

**A value is written once.** A repeat is a `{group.name}` reference, resolved at build time in each
theme: in `$value` it takes the named token's light value, in `$extensions.mode.dark` its dark
value, and a token with no dark value of its own inherits the dark value of the token it references
(`card-foreground` is `{color.foreground}`, so it follows the foreground in both themes). A value
two roles share across themes (the charcoal that is the light primary and the dark muted) is a
primitive in `color.json`'s `palette` group, which is never emitted as CSS. The generated stylesheet
therefore holds plain values only, with no `var()` alias that would resolve where `:root` declares
it, so `.dark` works on any element. `packages/tokens/src/tokens.test.ts` fails when a colour
literal is written twice.

Two token groups exist for layout, not looks:

- `--site-header-inset`, `--site-header-bar` and `--site-header-height` (their sum): the header's
  pill from `sm` up. A fixed sidebar below it starts at `--site-header-height` (`belowSiteHeader`).
  `--site-header-radius` and `--site-header-max-width` are the pill's corners and widest width
  (`siteHeaderBar`).
- `--site-header-offset` (`--site-header-height` plus `--site-header-gap`, 96 px): where an in-page
  jump stops below a stuck header. `SiteHeaderShell sticky` marks the header `data-sticky`; only
  then does `globals.css` set `--sticky-header-offset` to it (otherwise `0px`) and give `<html>` a
  `scroll-padding-top` of it plus the safe-area inset. An element that needs its own scroll margin
  (www's sections, the MDX headings) uses `scroll-mt-(--sticky-header-offset)`, never a literal.
- `--layer-sidebar` (10) and `--layer-above-sidebar` (always one above it): what covers the fixed
  sidebar where they meet, i.e. account's footer (`aboveSidebar`). `--layer-header` (50) stacks the
  sticky header.

## One stylesheet

`packages/ui/src/styles/globals.css` imports Tailwind, the generated tokens, the base rules,
www's motion rules and its high-contrast and forced-colors support. Every app's `src/styles/globals.css` is
that file's one import (`@import "@repo/ui/globals.css";`) and nothing else: no theme file to add
(`themes/coaching.css` is gone), no colour, no rule of its own. An app that needs a style writes
Tailwind classes on a shared component, or the style goes in `packages/ui`.

Every root layout puts `fontVariables` (from `@repo/ui/lib/fonts`: the sans and display families)
and `data-scroll-behavior="smooth"` on `<html>`, and `font-sans antialiased` on `<body>`. The
attribute is Next's opt-in so its router does not fight the CSS smooth scrolling. The fonts go on
`<html>` because the typeface tokens are declared on `:root` and a custom property resolves where
it is declared: `--typeface-sans` is `var(--font-inter, <system sans>)` and `--typeface-display` is
Fraunces (`--font-fraunces`) then Georgia, so they need next/font's variables on that element.
Tailwind's `font-sans`, `font-display` and `font-mono` read the `--typeface-*` tokens under names of
their own, so no variable refers to itself. Storybook loads no web fonts: there the fallbacks
stand alone.

`scripts/app-styles.test.ts` (in `bun test scripts`) fails when an app's stylesheet is anything but
the one import, a layout lacks `fontVariables` or `data-scroll-behavior`, or a colour literal
(hex, `rgb()`, `oklch()`, …) sits in any Next app's `src`. The few that must stay (the viewport
`themeColor`, the manifest colours: browser metadata, not CSS) are listed there with a reason, and
a stale entry fails too. `scripts/site-footer.test.ts` fails when a layout renders `SiteFooter`
without `SiteFooterLegal` or an app writes its own "©" line.

## Shared look components

In `packages/ui`, extracted from www so every app can use them: `Eyebrow`, `ArrowLink`,
`DashedLine`, `Picture`, `SunPanel`, `Background` (`components/`), `Reveal`/`RevealItem` and
`MediaClip` (`components/motion/`, `motion/react`, off under `prefers-reduced-motion`), `navPill`
(`components/nav-pill.ts`, the pill-shaped nav link), `NativeSelect`, and `Card` with
`size="compact"` (smaller radius and padding for dense app screens).

The header and footer are `SiteHeader` / `SiteFooter` (see **Site header & footer** in
`CLAUDE.md`), built on `SiteHeaderShell` and `siteHeaderBar`. An app with its own navigation passes
it as the `nav` slot; www draws its animated `ExploreNav` with `siteHeaderBar` inside
`SiteHeaderShell`.

## Retheming

Edit a value in `packages/tokens/src/tokens/`, run `bun run tokens`, commit the two generated
files. Keep every text pair at WCAG 4.5:1 and every UI pair at 3:1 in both themes:
`packages/ui/src/styles/contrast.test.ts` reads the generated CSS and fails otherwise. Then
re-run the visual baseline (`apps/e2e/README.md`, **Visual baseline**: opt-in, with snapshots that
are local and git-ignored) and the a11y sweep. Mail follows the tokens through the email file.
