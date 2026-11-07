#!/usr/bin/env bun
/**
 * `bun run --filter @repo/api backup [-- --out <file>]` — a portable logical dump of
 * `DATABASE_URL` (see `src/backup/dump.ts`). With `--out <file>`, the gzipped dump is written
 * straight to that local file and nothing else is touched; without it, it goes to the storage
 * seam (`STORAGE_PROVIDER`) under a fresh `backups/<date>/<engine>-<time>.jsonl.gz` key, which is
 * logged on success — pipe that into `restore-cli.ts` later. A relative `--out` resolves against
 * the process's cwd, which `bun run --filter` sets to `apps/api`; the absolute path is logged.
 * A key written here is pruned by `backup.run`'s retention like its own (same pattern), so keep a
 * backup you mean to hold on to with `--out`. Loads env the same way `index.ts`
 * does (`loadEnv(Bun.env)`), so it needs nothing beyond what the running api already needs, and
 * never prints a database URL or credential.
 */
import { rename, rm } from "node:fs/promises"
import { resolve } from "node:path"
import { createLogger } from "@repo/log"
import { dumpDatabase } from "./backup/dump"
import { createDb } from "./db"
import { loadEnv } from "./env"
import { backupKey, dumpToStorage } from "./jobs/builtin/backup"
import { createStorage } from "./storage/create-storage"

// Standalone, so it makes its own logger, configured like the api's (see index.ts).
const logger = createLogger({
  service: "api",
  env: { ...Bun.env, NODE_ENV: Bun.env.NODE_ENV || "production" },
})

function parseArgs(argv: string[]): { out?: string } {
  let out: string | undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--out") {
      out = argv[i + 1]
      if (!out) throw new Error("--out needs a file path")
      i++
    } else {
      throw new Error(`unknown argument "${arg}" (usage: backup [--out <file>])`)
    }
  }
  return { out }
}

async function main() {
  const { out } = parseArgs(Bun.argv.slice(2))
  const env = loadEnv(Bun.env)
  const db = createDb(env.DATABASE_URL, { logger })
  try {
    if (out) {
      // Relative to this process's cwd — under `bun run --filter`, that is apps/api.
      const path = resolve(out)
      // Written beside the target, renamed over it only once complete: a failed dump never leaves
      // a partial file at `path` or clobbers a good backup already there.
      const partial = `${path}.partial`
      try {
        await Bun.write(partial, new Response(dumpDatabase(db)))
        await rename(partial, path)
      } catch (error) {
        await rm(partial, { force: true })
        throw error
      }
      logger.info("backup: wrote file", { path })
      return
    }
    const storage = createStorage(env)
    const key = backupKey(db.dialect, new Date())
    const bytes = await dumpToStorage(db, storage, key)
    logger.info("backup: wrote object", { key, bytes })
  } finally {
    await db.close()
  }
}

main().catch((error: unknown) => {
  // One clear line, no stack: the message is the point, not the trace.
  logger.error(`backup failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
