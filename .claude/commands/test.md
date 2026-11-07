# Test Runner

Run tests for the monorepo.

## Arguments
- `$ARGUMENTS` - Optional test type: `unit` (default) or `story`

## Instructions

Based on the argument provided, run the appropriate test command:

1. **No argument or `unit`**: the tests CI gates on
   ```bash
   bun run test:services   # bun test in apps/api, apps/ai and apps/app
   bun test scripts        # the CI planner (scripts/ci-plan.ts)
   ```
   One workspace: `bun --filter @repo/<name> test`.

2. **`story`**: Storybook component tests (Vitest in a real Chromium; slow — CI shards them four ways)
   ```bash
   bun --filter @repo/story test --run
   ```

There is no browser end-to-end suite for the Next apps yet (see `docs/ROADMAP.md`, Phase 5).

Report the test results clearly, including:
- Number of tests passed/failed
- Any error messages for failed tests
- Suggestions for fixing failures if applicable
