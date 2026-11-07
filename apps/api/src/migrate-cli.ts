#!/usr/bin/env bun
/**
 * `bun run --filter @repo/api db:migrate` — applies pending migrations to DATABASE_URL and says
 * what it did. The service also migrates at startup; this is for deploy steps and CI.
 */

import { createLogger } from "@repo/log"
import { createDb } from "./db"
import { DEFAULT_DATABASE_URL } from "./env"

// Standalone, so it makes its own logger, configured like the api's (see index.ts).
const logger = createLogger({
  service: "api",
  env: { ...Bun.env, NODE_ENV: Bun.env.NODE_ENV || "production" },
})

const url = Bun.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL

async function main() {
  const db = createDb(url, { logger })
  try {
    const applied = await db.migrate()
    if (applied.length === 0) logger.info("no migrations to apply")
    for (const name of applied) logger.info("migration applied", { migration: name })
  } finally {
    await db.close()
  }
}

main().catch((error: unknown) => {
  // One clear line, no stack: the message (an unreachable host, a failing statement) is the point.
  logger.error(`migration failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
