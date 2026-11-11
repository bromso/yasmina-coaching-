# @repo/tokens

The design tokens: the one place a colour, radius, shadow, spacing, font, motion or layer value is
written. Full reference: [docs/architecture/design-system.md](../../docs/architecture/design-system.md).

```
src/tokens/*.json   the source (W3C-style: $type, $value, $description)
src/generate.ts     the style-dictionary 5 build (sd.config.js just calls it)
src/render.ts       the pure renderers, shared with scripts/tokens.test.ts
src/color.ts        @repo/tokens/color: oklch to sRGB, luminance, WCAG contrast
```

## Build

```bash
bun run tokens      # from the root; same as: bun --filter @repo/tokens build
```

It writes two committed files and one uncommitted one:

- `packages/ui/src/styles/tokens.generated.css`: `:root` (light) and `.dark`, colours in `oklch()`;
- `packages/email/src/tokens.generated.ts`: the light palette as hex plus the mail fonts;
- `dist/json/tokens.json` (`@repo/tokens/json`): for Storybook only.

Never edit a generated file. `scripts/tokens.test.ts` (in `bun test scripts`) fails when either
committed file differs from what the tokens render. A file is written only when its content
changed.

## Writing a token

- A colour has a light `$value` and, when dark differs, `$extensions.mode.dark`.
- Anything that is not a colour is emitted for `:root` only.
- `{group.name}` references another token; `var(--x)` makes a CSS alias. The `sidebar-*` and three
  chart tokens are `var()` aliases defined on `:root` only, so `.dark` must stay on `<html>`.
- Keep text pairs at 4.5:1 and UI pairs at 3:1 in both themes (`packages/ui`'s `contrast.test.ts`).

`bun test` here runs `src/tokens.test.ts` over the renderers; `bun run typecheck` checks the package.
