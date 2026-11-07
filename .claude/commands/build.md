# Build

Build production bundles for a specific app or all apps.

## Usage
`/build [app-name]`

## Arguments
- **No argument** or **all**: build every workspace (`bun run build`)
- **www**, **app**, **auth**, **account**, **docs**, **help**, **jobs**: Next.js standalone build
- **api**, **ai**: `bun build` bundle to `apps/<name>/dist/`
- **story**: Storybook static site

## Instructions

Based on the argument provided by the user:

1. If no argument or "all": run `bun run build`
2. Otherwise: run `bun --filter @repo/<app-name> build`

After the build completes, report the result to the user. If the build fails, help diagnose the issue.
