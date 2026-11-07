# Clean

Remove build artifacts and cached files from the monorepo.

## Usage

`/clean`

## Instructions

Run the clean script to remove:
- `node_modules` - All installed dependencies (root, apps, and packages)
- `.next` - Next.js build output (apps)
- `packages/tokens/dist` - Compiled design tokens output
- `apps/story/storybook-static` - Built Storybook static output

Execute: `bun run clean`

After cleaning completes, remind the user to run `bun install` to reinstall dependencies before running dev or build commands.
