import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDb } from "./db"
import { localStorage } from "./storage/local"

const CLI = `${import.meta.dir}/backup-cli.ts`
const CWD = `${import.meta.dir}/..`
// Bun kills a hung spawn after this; see the suite's own "Spawned CLI processes need a timeout".
const SPAWN_TIMEOUT_MS = 15_000

describe("backup-cli", () => {
  const cleanups: Array<() => Promise<void>> = []
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
  })

  async function tempDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    return dir
  }

  /** A fresh SQLite file, migrated but with no data of its own, for the dump to read from. */
  async function sourceDbUrl(): Promise<string> {
    const dir = await tempDir("backup-cli-source-")
    const url = `sqlite://${join(dir, "source.db")}`
    const db = createDb(url)
    await db.migrate()
    await db.close()
    return url
  }

  function spawn(args: string[], env: Record<string, string | undefined>) {
    return Bun.spawn([process.execPath, CLI, ...args], {
      cwd: CWD,
      env: { ...process.env, ...env },
      stdout: "pipe",
      stderr: "pipe",
      timeout: SPAWN_TIMEOUT_MS,
    })
  }

  test("--out writes a local file; exit 0", async () => {
    const dbUrl = await sourceDbUrl()
    const outDir = await tempDir("backup-cli-out-")
    const outFile = join(outDir, "backup.jsonl.gz")

    const child = spawn(["--out", outFile], { DATABASE_URL: dbUrl, NODE_ENV: "test" })
    const [code, out] = await Promise.all([child.exited, new Response(child.stdout).text()])

    expect(code).toBe(0)
    expect(out).toContain("backup: wrote file")
    expect(out).toContain(outFile)
    expect(await Bun.file(outFile).exists()).toBe(true)
    expect(await Bun.file(`${outFile}.partial`).exists()).toBe(false)
  })

  test("a failed --out dump leaves an existing file untouched and no partial behind", async () => {
    const outDir = await tempDir("backup-cli-out-")
    const outFile = join(outDir, "backup.jsonl.gz")
    await Bun.write(outFile, "an earlier, good backup")
    // A path SQLite cannot open (a directory): the dump fails on its first read.
    const child = spawn(["--out", outFile], {
      DATABASE_URL: `sqlite://${outDir}`,
      NODE_ENV: "test",
    })
    const [code, err] = await Promise.all([child.exited, new Response(child.stderr).text()])

    expect(code).toBe(1)
    expect(err).toContain("backup failed")
    expect(await Bun.file(outFile).text()).toBe("an earlier, good backup")
    expect(await Bun.file(`${outFile}.partial`).exists()).toBe(false)
  })

  test("without --out, writes to storage (local provider) and prints the key", async () => {
    const dbUrl = await sourceDbUrl()
    const storageDir = await tempDir("backup-cli-storage-")

    const child = spawn([], {
      DATABASE_URL: dbUrl,
      NODE_ENV: "test",
      STORAGE_PROVIDER: "local",
      STORAGE_DIR: storageDir,
    })
    const [code, out] = await Promise.all([child.exited, new Response(child.stdout).text()])

    expect(code).toBe(0)
    const key = out.match(/key=(backups\/\S+\.jsonl\.gz)/)?.[1]
    expect(key).toBeTruthy()

    const object = await localStorage(storageDir).get(key as string)
    expect(object).not.toBeNull()
  })

  test("an unknown argument exits 1 with a clear message, no stack", async () => {
    const child = spawn(["--nope"], { DATABASE_URL: "sqlite://:memory:", NODE_ENV: "test" })
    const [code, err] = await Promise.all([child.exited, new Response(child.stderr).text()])

    expect(code).toBe(1)
    expect(err).toContain("backup failed: unknown argument")
    expect(err).not.toContain("    at ")
  })

  test("logs json in production", async () => {
    const dbUrl = await sourceDbUrl()
    const outDir = await tempDir("backup-cli-json-")
    const outFile = join(outDir, "backup.jsonl.gz")

    const child = spawn(["--out", outFile], {
      DATABASE_URL: dbUrl,
      NODE_ENV: "production",
      API_SERVICE_TOKEN: "p".repeat(32),
      AUTH_URL: "https://auth.example.com",
      ACCOUNT_URL: "https://account.example.com",
      APP_URL: "https://app.example.com",
      // PASSKEY_RP_ID defaults to it and must cover the two hosts above, or loadEnv refuses.
      SITE_DOMAIN: "example.com",
      TWO_FACTOR_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    })
    const [code, out] = await Promise.all([child.exited, new Response(child.stdout).text()])

    expect(code).toBe(0)
    const line = out.trim().split("\n").at(-1) as string
    expect(JSON.parse(line)).toMatchObject({ level: "info", message: "backup: wrote file" })
  })
})
