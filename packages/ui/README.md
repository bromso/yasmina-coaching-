# @repo/ui

Shared components, blocks and styles for every Next app. Layers, one-way: tokens, components
(`src/components/`), blocks (`src/blocks/`), then each app's views and pages. A block never imports
a view or a page. Add shadcn components with `bunx shadcn@latest add <name> -c packages/ui`.

## The look

- **Stylesheet.** `src/styles/globals.css` is the only stylesheet; an app's own
  `src/styles/globals.css` is `@import "@repo/ui/globals.css";` and nothing else. It imports
  `src/styles/tokens.generated.css`, generated from [`packages/tokens`](../tokens/README.md) by
  `bun run tokens`: change a value there, never in a generated file.
- **Fonts.** `@repo/ui/lib/fonts`: put `fontVariables` on `<html>` (sans and display families),
  where the `:root` typeface tokens can read them, and `font-sans` on `<body>`.
- **Look components.** `Eyebrow`, `ArrowLink`, `DashedLine`, `Picture`, `SunPanel`, `Background`,
  `navPill`, `NativeSelect`, `Card` (`size="compact"`), and in `components/motion/` `Reveal` and
  `MediaClip` (off under `prefers-reduced-motion`).
- **Header and footer.** `SiteHeader` (`nav?` slot), `SiteHeaderShell`, `siteHeaderBar`,
  `belowSiteHeader`, `aboveSidebar`, `SiteFooter` and `SiteFooterLegal`. They size from
  `--site-header-height` and `--layer-*` in the tokens.

`bun test` runs the component tests, `contrast.test.ts` included (it reads the generated CSS). The
typecheck and lint boundary for vendored components is described in `CLAUDE.md`, **Quality gates**.
Full reference: [docs/architecture/design-system.md](../../docs/architecture/design-system.md).
