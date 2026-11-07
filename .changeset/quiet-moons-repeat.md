---
"@repo/app": minor
"@repo/www": minor
---

Replace Turborepo with Bun workspaces for task orchestration. Root scripts now use `bun run --filter`; `bun turbo check-types` becomes `bun run typecheck`.
