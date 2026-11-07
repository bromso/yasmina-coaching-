import { join } from "node:path"
import { defineConfig, devices } from "@playwright/test"
import { aiEnv, apiEnv, shared, URLS } from "./e2e.env"

const CI = Boolean(process.env.CI)
const root = join(import.meta.dirname, "..", "..")
const next = (app: string, port: number) => ({
  // The app's own `next` binary: `bunx next` from the app directory may resolve another copy.
  command: `node_modules/.bin/next start --port ${port} --hostname ${app}.brand.localhost`,
  cwd: join(root, "apps", app),
  url: `http://${app}.brand.localhost:${port}/api/health`,
  env: { ...shared },
  reuseExistingServer: !CI,
  timeout: 120_000,
  stdout: "pipe" as const,
})

export default defineConfig({
  testDir: "tests",
  fullyParallel: false,
  workers: 1,
  retries: CI ? 1 : 0,
  forbidOnly: CI,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // The reset runs first, before the api opens its database (see global-setup.ts).
      command: `bun ${JSON.stringify(join(import.meta.dirname, "global-setup.ts"))} && bun src/index.ts`,
      cwd: join(root, "apps", "api"),
      url: `${URLS.api}/ready`,
      env: { ...apiEnv },
      reuseExistingServer: !CI,
      timeout: 60_000,
      stdout: "pipe",
    },
    {
      command: "bun src/index.ts",
      cwd: join(root, "apps", "ai"),
      url: `${URLS.ai}/ready`,
      env: { ...aiEnv },
      reuseExistingServer: !CI,
      timeout: 60_000,
      stdout: "pipe",
    },
    next("www", 3000),
    next("app", 3001),
    next("auth", 3002),
    next("account", 3003),
    next("docs", 3004),
    next("help", 3005),
    next("jobs", 3006),
    next("blog", 3009),
  ],
})
