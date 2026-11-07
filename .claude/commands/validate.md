# Full Validation

Run complete project validation including formatting, linting, type checking, and building.

## Instructions

Run the full validation pipeline:

```bash
bun run validate
```

This typically runs:
1. Format check (Biome)
2. Lint check (Biome)
3. Type check (TypeScript)
4. Build all apps

Report the results clearly:
- Overall pass/fail status
- Any formatting issues
- Any lint errors with file locations
- Any TypeScript errors with details
- Build success or failure per app

If validation fails, provide actionable suggestions for fixing the issues.
