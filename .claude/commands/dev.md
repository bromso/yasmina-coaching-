Start the development server for a specific app or all apps.

## Usage
`/dev [app-name]`

## Arguments
- **No argument** or **all**: every app in parallel via Bun workspaces (`bun dev`)
- **www** (:3000), **app** (:3001), **auth** (:3002), **account** (:3003), **docs** (:3004),
  **help** (:3005), **jobs** (:3006): Next.js apps on `http://<name>.localhost:<port>`
- **api** (:3007), **ai** (:3008): Bun services on `http://<name>.localhost:<port>`
- **story** (:6006): Storybook

## Instructions
Based on the argument provided by the user:

1. If no argument or "all": run `bun dev`
2. Otherwise: run `bun --filter @repo/<app-name> dev`

Run the command in the background so the user can continue working, and report the URL.
