import { describe, expect, test } from "bun:test"
import { apiClient, signUpVerified, withWorkspace } from "./clients"
import { aiEnvFor, apiEnvFor, startStack } from "./stack"

describe("stack env", () => {
  const opts = { db: "sqlite" as const, apiPort: 3037, aiPort: 3038 }

  test("production mode, a fresh SQLite file, the file mailbox, raised limits", () => {
    const env = apiEnvFor(opts, "/tmp/run")
    expect(env).toMatchObject({
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: "3037",
      DATABASE_URL: "sqlite:///tmp/run/api.db",
      MAIL_PROVIDER: "file",
      MAIL_DIR: "/tmp/run/mail",
      STORAGE_PROVIDER: "local",
      STORAGE_DIR: "/tmp/run/storage",
    })
    expect(Number(env.API_RATE_LIMIT)).toBeGreaterThanOrEqual(10_000)
    expect(aiEnvFor(opts)).toMatchObject({ AI_MODEL: "mock:echo", PORT: "3038" })
  })

  test("overrides win; postgres needs a DATABASE_URL", () => {
    expect(apiEnvFor({ ...opts, env: { API_RATE_LIMIT: "300" } }, "/r").API_RATE_LIMIT).toBe("300")
    const pg = "postgres://u:p@127.0.0.1:5432/load"
    expect(
      apiEnvFor({ ...opts, db: "postgres", env: { DATABASE_URL: pg } }, "/r").DATABASE_URL
    ).toBe(pg)
    const saved = { a: process.env.LOAD_DATABASE_URL, b: process.env.DATABASE_URL }
    delete process.env.LOAD_DATABASE_URL
    delete process.env.DATABASE_URL
    try {
      expect(() => apiEnvFor({ ...opts, db: "postgres" }, "/r")).toThrow("DATABASE_URL")
    } finally {
      if (saved.a !== undefined) process.env.LOAD_DATABASE_URL = saved.a
      if (saved.b !== undefined) process.env.DATABASE_URL = saved.b
    }
  })
})

describe("startStack", () => {
  test(
    "starts api + ai on spare ports, signs up a verified user, and stops both",
    async () => {
      const stack = await startStack({ db: "sqlite", apiPort: 3037, aiPort: 3038 })
      try {
        expect((await fetch(`${stack.apiUrl}/ready`)).status).toBe(200)
        expect((await fetch(`${stack.aiUrl}/ready`)).status).toBe(200)

        const user = await signUpVerified("load-stack@example.com", {
          target: stack.target,
          mailDir: stack.mailDir,
        })
        expect(user.userId).toBeGreaterThan(0)
        const me = await user.client.auth.me()
        expect(me.user.emailVerified).toBe(true)
        const workspaceId = await withWorkspace(user.client)
        const notes = await user.client.notes.list({ workspaceId })
        expect(notes.items).toEqual([])

        // An unknown session is refused, not a 5xx.
        const stranger = apiClient({ target: stack.target, sessionToken: "nope" })
        await expect(stranger.auth.me()).rejects.toMatchObject({ status: 401 })
      } finally {
        await stack.stop()
      }
      await expect(fetch(`${stack.apiUrl}/ready`)).rejects.toThrow()
      await expect(fetch(`${stack.aiUrl}/ready`)).rejects.toThrow()
    },
    { timeout: 15_000 }
  )
})
