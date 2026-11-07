Run TypeScript type checking across the monorepo.

## Instructions

1. Run `bun run typecheck` — app, www, blog, docs, help, jobs, api, api-contract,
   public-api-contract, ai, ai-contract, service-kit, sites, content, email, session, telemetry,
   i18n, i18n-guard, log, auth, account, e2e, load and story
2. Run `bun run typecheck:ui` — `packages/ui` (scoped; see CLAUDE.md "Quality gates")
3. To check a single workspace: `bun run --filter @repo/<name> typecheck`
4. Report any type errors found with file locations

## Common Type Issues
- Missing imports or exports from `@repo/ui` (check `packages/ui/package.json` `exports`)
- A service handler that no longer matches its contract in `packages/api-contract` or
  `packages/ai-contract`
- React component prop mismatches
- Environment variable types

## Quick Fixes
- Add missing type imports
- Change the contract first, then the handler, when an endpoint's shape changes
- Use `as const` for literal types
- Check tsconfig.json paths configuration
