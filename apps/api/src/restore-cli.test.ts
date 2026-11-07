import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDb } from "./db"

const BACKUP_CLI = `${import.meta.dir}/backup-cli.ts`
const RESTORE_CLI = `${import.meta.dir}/restore-cli.ts`
const CWD = `${import.meta.dir}/..`
// Bun kills a hung spawn after this; see the suite's own "Spawned CLI processes need a timeout".
const SPAWN_TIMEOUT_MS = 15_000

describe("restore-cli", () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  })

  async function tempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    return dir
  }

  /** A fresh SQLite file, migrated but with no data of its own, for a dump to read from. */
  async function sourceDbUrl(): Promise<string> {
    const dir = await tempDir("restore-cli-source-")
    const url = `sqlite://${join(dir, "source.db")}`
    const db = createDb(url)
    await db.migrate()
    await db.close()
    return url
  }

  /** An unmigrated SQLite file path (the file itself does not exist yet). */
  async function emptyTargetUrl(): Promise<string> {
    const dir = await tempDir("restore-cli-target-")
    return `sqlite://${join(dir, "target.db")}`
  }

  function spawn(cli: string, args: string[], env: Record<string, string | undefined>) {
    return Bun.spawn([process.execPath, cli, ...args], {
      cwd: CWD,
      env: { ...process.env, ...env },
      stdout: "pipe",
      stderr: "pipe",
      timeout: SPAWN_TIMEOUT_MS,
    })
  }

  async function backupToFile(dbUrl: string, outFile: string): Promise<void> {
    const child = spawn(BACKUP_CLI, ["--out", outFile], { DATABASE_URL: dbUrl, NODE_ENV: "test" })
    expect(await child.exited).toBe(0)
  }

  test("<file> loads into an empty database; exit 0", async () => {
    const dbUrl = await sourceDbUrl()
    const outDir = await tempDir("restore-cli-out-")
    const outFile = join(outDir, "backup.jsonl.gz")
    await backupToFile(dbUrl, outFile)

    const targetUrl = await emptyTargetUrl()
    const restore = spawn(RESTORE_CLI, [outFile], { DATABASE_URL: targetUrl, NODE_ENV: "test" })
    const [code, out] = await Promise.all([restore.exited, new Response(restore.stdout).text()])

    expect(code).toBe(0)
    expect(out).toContain("restore: done")
  })

  test("<key> reads from storage", async () => {
    const dbUrl = await sourceDbUrl()
    const storageDir = await tempDir("restore-cli-storage-")

    const backup = spawn(BACKUP_CLI, [], {
      DATABASE_URL: dbUrl,
      NODE_ENV: "test",
      STORAGE_PROVIDER: "local",
      STORAGE_DIR: storageDir,
    })
    const [backupCode, backupOut] = await Promise.all([
      backup.exited,
      new Response(backup.stdout).text(),
    ])
    expect(backupCode).toBe(0)
    const key = backupOut.match(/key=(backups\/\S+\.jsonl\.gz)/)?.[1]
    expect(key).toBeTruthy()

    const targetUrl = await emptyTargetUrl()
    const restore = spawn(RESTORE_CLI, [key as string], {
      DATABASE_URL: targetUrl,
      NODE_ENV: "test",
      STORAGE_PROVIDER: "local",
      STORAGE_DIR: storageDir,
    })
    const [code, out] = await Promise.all([restore.exited, new Response(restore.stdout).text()])

    expect(code).toBe(0)
    expect(out).toContain("restore: done")
  })

  test("a non-empty target refuses without --force, naming it; --force succeeds", async () => {
    const dbUrl = await sourceDbUrl()
    const outDir = await tempDir("restore-cli-force-")
    const outFile = join(outDir, "backup.jsonl.gz")
    await backupToFile(dbUrl, outFile)

    const targetUrl = await emptyTargetUrl()
    const targetDb = createDb(targetUrl)
    await targetDb.migrate()
    await targetDb.sql`INSERT INTO waitlist (email, source, created_at) VALUES (${"a@example.com"}, ${"www"}, ${new Date().toISOString()})`
    await targetDb.close()

    const refused = spawn(RESTORE_CLI, [outFile], { DATABASE_URL: targetUrl, NODE_ENV: "test" })
    const [refusedCode, err] = await Promise.all([
      refused.exited,
      new Response(refused.stderr).text(),
    ])
    expect(refusedCode).toBe(1)
    expect(err).toContain("--force")
    expect(err).not.toContain("    at ")

    const forced = spawn(RESTORE_CLI, [outFile, "--force"], {
      DATABASE_URL: targetUrl,
      NODE_ENV: "test",
    })
    const [forcedCode, out] = await Promise.all([forced.exited, new Response(forced.stdout).text()])
    expect(forcedCode).toBe(0)
    expect(out).toContain("restore: done")
  })

  test("a missing file/key exits 1 with a clear message", async () => {
    const targetUrl = await emptyTargetUrl()
    const storageDir = await tempDir("restore-cli-missing-")

    const restore = spawn(RESTORE_CLI, ["definitely-not-a-backup.jsonl.gz"], {
      DATABASE_URL: targetUrl,
      NODE_ENV: "test",
      STORAGE_PROVIDER: "local",
      STORAGE_DIR: storageDir,
    })
    const [code, err] = await Promise.all([restore.exited, new Response(restore.stderr).text()])

    expect(code).toBe(1)
    expect(err).toContain("restore failed: no backup found")
    expect(err).not.toContain("    at ")
  })

  test("no source argument exits 1 with usage", async () => {
    const targetUrl = await emptyTargetUrl()
    const restore = spawn(RESTORE_CLI, [], { DATABASE_URL: targetUrl, NODE_ENV: "test" })
    const [code, err] = await Promise.all([restore.exited, new Response(restore.stderr).text()])

    expect(code).toBe(1)
    expect(err).toContain("usage: restore <file|key> [--force]")
  })
})
