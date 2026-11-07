# Storybook Development

Manage Storybook for component development.

## Arguments
- `$ARGUMENTS` - Optional action: `dev`, `build`, or `test`

## Instructions

Based on the argument provided, run the appropriate Storybook command:

1. **No argument or `dev`**: Start Storybook development server
   ```bash
   bun story
   ```
   Run this in the background. Storybook will be available at http://localhost:6006

2. **`build`**: Build static Storybook for deployment
   ```bash
   bun --filter @repo/story build
   ```

3. **`test`**: Run Storybook component tests
   ```bash
   bun --filter @repo/story test
   ```

When starting the dev server, confirm it's running and provide the URL. For build/test, report the results.
