#!/usr/bin/env bun
/**
 * `bun run --filter @repo/api restore <file|key> [-- --force]` — loads a backup (see
 * `src/backup/restore.ts`) into `DATABASE_URL`: a local path when it exists on disk, otherwise a
 * storage key read through the storage seam (`STORAGE_PROVIDER`). Refuses a target holding any
 * row unless `--force` is given, which deletes them first; a target with more migrations applied
 * than the backup lists is refused even with `--force` — this code cannot undo a migration, so
 * restore into a fresh database instead. Loads env the same way `index.ts` does (`loadEnv`), and
 * never prints a database URL or credential.
 */
import { resolve } from "node:path"
import { createLogger } from "@repo/log"
import { RestoreTargetNotEmpty } from "./backup/format"
import { restoreDatabase } from "./backup/restore"
import { createDb } from "./db"
import { loadEnv } from "./env"
import { createStorage } from "./storage/create-storage"

// Standalone, so it makes its own logger, configured like the api's (see index.ts).
const logger = createLogger({
  service: "api",
  env: { ...Bun.env, NODE_ENV: Bun.env.NODE_ENV || "production" },
})

function parseArgs(argv: string[]): { source: string; force: boolean } {
  let source: string | undefined
  let force = false
  for (const arg of argv) {
    if (arg === "--force") force = true
    else if (source === undefined) source = arg
    else throw new Error(`unknown argument "${arg}" (usage: restore <file|key> [--force])`)
  }
  if (source === undefined) throw new Error("usage: restore <file|key> [--force]")
  return { source, force }
}

async function readSource(source: string, env: ReturnType<typeof loadEnv>): Promise<Uint8Array> {
  // Relative to this process's cwd — under `bun run --filter`, that is apps/api.
  const path = resolve(source)
  const file = Bun.file(path)
  if (await file.exists()) {
    logger.info("restore: reading file", { path })
    return new Uint8Array(await file.arrayBuffer())
  }
  const storage = createStorage(env)
  const object = await storage.get(source)
  if (!object) {
    throw new Error(`no backup found at "${source}" (no file at ${path}, no such storage key)`)
  }
  logger.info("restore: reading object", { key: source })
  return object.body
}

async function main() {
  const { source, force } = parseArgs(Bun.argv.slice(2))
  const env = loadEnv(Bun.env)
  const bytes = await readSource(source, env)
  const db = createDb(env.DATABASE_URL, { logger })
  try {
    // restoreDatabase logs "restore: done" with the counts itself.
    await restoreDatabase(db, bytes, { force, log: logger })
  } finally {
    await db.close()
  }
}

main().catch((error: unknown) => {
  if (error instanceof RestoreTargetNotEmpty) {
    logger.error(
      `restore failed: the target database is not empty (rows in ${error.tables.join(", ")}): ` +
        "retry with --force to delete those rows first, or restore into an empty database"
    )
  } else {
    // One clear line, no stack: the message is the point, not the trace.
    logger.error(`restore failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  process.exit(1)
})
