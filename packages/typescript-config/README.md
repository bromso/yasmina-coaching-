# @repo/typescript-config

Shared `tsconfig` presets. Extend one from a workspace's `tsconfig.json`:

```json
{ "extends": "@repo/typescript-config/bun.json" }
```

| Preset | For | Used by |
|---|---|---|
| `base.json` | Strict ES2022 base every preset extends (`noUncheckedIndexedAccess`, `isolatedModules`) | `packages/api-contract`, `packages/ai-contract` |
| `react-library.json` | React packages bundled by a consumer (`jsx: react-jsx`, bundler resolution) | `packages/ui`, `apps/story` |
| `bun.json` | Bun-runtime services (`module: Preserve`, `verbatimModuleSyntax`, no DOM lib) — add `"types": ["bun"]` | `apps/api`, `apps/ai` |
| `nextjs.json` | Next.js apps (`next` plugin, `jsx: preserve`) | — the Next apps currently keep their own standalone `tsconfig.json` |

`base.json` sets `declaration: true`. Workspaces that only typecheck (`noEmit`) and export values
inferred from library types may need `"declaration": false` to avoid TS2742 — see
`packages/ai-contract/tsconfig.json`.
