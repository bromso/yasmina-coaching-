import { mkdirSync, rmSync } from "node:fs"
import { MAIL_DIR, TMP } from "./e2e.env"

/**
 * Every run starts from an empty database and mailbox. A script, not Playwright's `globalSetup`:
 * Playwright starts the `webServer`s before `globalSetup` runs, which would wipe the database
 * under a running api. `playwright.config.ts` runs it as the prefix of the api's start command,
 * so it runs only when the harness starts its own api (never against a reused one).
 */
rmSync(TMP, { recursive: true, force: true })
mkdirSync(MAIL_DIR, { recursive: true })
