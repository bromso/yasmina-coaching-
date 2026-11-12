import { afterEach, describe, expect, test } from "bun:test"
import { SQL } from "bun"
import { createDb } from "./db"
import { ddl } from "./dialect"
import { type Migration, migrate } from "./migrate"
import { migrations } from "./migrations"
import notes from "./migrations/0001_notes"
import { engines, testDatabase } from "./test-db"
import { isPendingInviteTaken } from "./workspaces"

const noop: Migration["up"] = async () => {}
const step = (name: string, up: Migration["up"] = noop): Migration => ({ name, up })
const createsTable = (name: string): Migration => ({
  name,
  up: async (sql) => {
    await sql.unsafe(`CREATE TABLE ${name} (id INTEGER)`)
  },
})
const names = async (sql: SQL) =>
  (await sql`SELECT name FROM schema_migrations ORDER BY name`).map((r: { name: string }) => r.name)

for (const engine of engines) {
  describe(`migrate on ${engine}`, () => {
    const cleanups: Array<() => Promise<void>> = []
    afterEach(async () => {
      for (const cleanup of cleanups.splice(0)) await cleanup()
    })
    async function fresh() {
      const db = await testDatabase(engine)
      const sql = new SQL(db.url)
      cleanups.push(async () => {
        await sql.close()
        await db.cleanup()
      })
      return { sql, url: db.url }
    }

    test("applies pending migrations in order and records them; a second run applies nothing", async () => {
      const { sql } = await fresh()
      const order: string[] = []
      const list = [
        step("0001_a", async () => {
          order.push("a")
        }),
        step("0002_b", async () => {
          order.push("b")
        }),
      ]
      expect(await migrate(sql, list)).toEqual(["0001_a", "0002_b"])
      expect(order).toEqual(["a", "b"])
      expect(await migrate(sql, list)).toEqual([])
      expect(await names(sql)).toEqual(["0001_a", "0002_b"])
    })

    test("a new migration added later applies alone", async () => {
      const { sql } = await fresh()
      await migrate(sql, [step("0001_a")])
      expect(await migrate(sql, [step("0001_a"), step("0002_b")])).toEqual(["0002_b"])
    })

    test("a failing migration is rolled back entirely; earlier ones stay applied", async () => {
      const { sql } = await fresh()
      const list = [
        createsTable("t_first"),
        step("0002_boom", async (s) => {
          await s.unsafe("CREATE TABLE t_partial (id INTEGER)")
          throw new Error("boom")
        }),
      ]
      await expect(migrate(sql, list)).rejects.toThrow("boom")
      expect(await names(sql)).toEqual(["t_first"])
      await sql`SELECT * FROM t_first`
      // .execute(): `expect()` never starts a lazy Bun.sql query and spins (Bun 1.3.14 and 1.4.2).
      await expect(sql`SELECT * FROM t_partial`.execute()).rejects.toThrow()
    })

    test("a recorded migration this build does not know stops it", async () => {
      const { sql } = await fresh()
      await migrate(sql, [step("0001_a"), step("0002_future")])
      await expect(migrate(sql, [step("0001_a"), step("0003_c")])).rejects.toThrow(
        'unknown migration "0002_future": this build is older than the database'
      )
      expect(await names(sql)).toEqual(["0001_a", "0002_future"])
    })

    test("duplicate names in the list are a programming error", async () => {
      const { sql } = await fresh()
      await expect(migrate(sql, [step("0001_a"), step("0001_a")])).rejects.toThrow(
        'duplicate migration name "0001_a"'
      )
    })

    test("adopts a notes table created by the old CREATE TABLE IF NOT EXISTS", async () => {
      const { sql } = await fresh()
      await sql.unsafe(`
        CREATE TABLE notes (
          id ${ddl.serialId(engine)},
          title TEXT NOT NULL,
          body TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL
        )
      `)
      await sql`INSERT INTO notes (title, body, created_at) VALUES ('old', '', '2026-01-01T00:00:00.000Z')`
      expect(await migrate(sql, [notes])).toEqual(["0001_notes"])
      const titles = (await sql`SELECT title FROM notes`).map((r: { title: string }) => r.title)
      expect(titles).toEqual(["old"])
      expect(await migrate(sql, [notes])).toEqual([])
    })

    test("0004 migrates password_resets rows into tokens and drops the old table", async () => {
      const { sql } = await fresh()
      await migrate(sql, migrations.slice(0, 3))
      const [user] = await sql`
        INSERT INTO users (email, password_hash, name, created_at, updated_at)
        VALUES ('a@example.com', 'h', '', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
        RETURNING *
      `
      await sql`
        INSERT INTO password_resets (token_hash, user_id, expires_at)
        VALUES ('h1', ${user.id}, '2026-01-02T00:00:00.000Z')
      `
      expect(await migrate(sql, migrations.slice(0, 4))).toEqual(["0004_email_verification"])
      const [row] = await sql`SELECT * FROM tokens`
      expect(row).toMatchObject({
        user_id: user.id,
        purpose: "password_reset",
        token_hash: "h1",
        expires_at: "2026-01-02T00:00:00.000Z",
        consumed_at: null,
        created_at: "2026-01-02T00:00:00.000Z",
      })
      if (engine === "sqlite") {
        const rows: Array<{ name: string }> =
          await sql`SELECT name FROM sqlite_master WHERE name = 'password_resets'`
        expect(rows).toEqual([])
      } else {
        const [regrow]: Array<{ reg: string | null }> =
          await sql`SELECT to_regclass('password_resets') AS reg`
        expect(regrow?.reg).toBeNull()
      }
    })

    test("0005 keeps users and tokens, allows passwordless users and magic tokens, adds identities", async () => {
      const { sql } = await fresh()
      await migrate(sql, migrations.slice(0, 4))
      const [user] = await sql`
        INSERT INTO users (email, password_hash, name, created_at, updated_at, email_verified_at)
        VALUES ('a@example.com', 'h', 'Ada', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z',
          '2026-01-03T00:00:00.000Z')
        RETURNING *
      `
      await sql`
        INSERT INTO tokens (user_id, purpose, token_hash, expires_at, created_at)
        VALUES (${user.id}, 'email_verify', 't1', '2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
      `
      expect(await migrate(sql, migrations.slice(0, 5))).toEqual(["0005_identities"])

      const [kept] = await sql`SELECT * FROM users WHERE id = ${user.id}`
      expect(kept).toMatchObject({
        email: "a@example.com",
        password_hash: "h",
        name: "Ada",
        email_verified_at: "2026-01-03T00:00:00.000Z",
      })
      const [token] = await sql`SELECT * FROM tokens WHERE token_hash = 't1'`
      expect(token).toMatchObject({ user_id: user.id, purpose: "email_verify", email: null })

      const [passwordless] = await sql`
        INSERT INTO users (email, password_hash, name, created_at, updated_at)
        VALUES ('b@example.com', NULL, '', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
        RETURNING *
      `
      expect(passwordless.password_hash).toBeNull()
      // The ids keep counting from where they were, so sessions and tokens still point right.
      expect(passwordless.id).toBeGreaterThan(user.id)
      await expect(
        sql`
          INSERT INTO users (email, password_hash, name, created_at, updated_at)
          VALUES ('a@example.com', NULL, '', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
        `.execute()
      ).rejects.toThrow()

      await sql`
        INSERT INTO tokens (user_id, purpose, token_hash, expires_at, created_at, email)
        VALUES (NULL, 'magic_link', 't2', '2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z',
          'new@example.com')
      `
      await expect(
        sql`
          INSERT INTO tokens (user_id, purpose, token_hash, expires_at, created_at)
          VALUES (NULL, 'bogus', 't3', '2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
        `.execute()
      ).rejects.toThrow()

      await sql`
        INSERT INTO identities (user_id, provider, provider_user_id, email, created_at)
        VALUES (${user.id}, 'github', '42', NULL, '2026-01-01T00:00:00.000Z')
      `
      await expect(
        sql`
          INSERT INTO identities (user_id, provider, provider_user_id, email, created_at)
          VALUES (${passwordless.id}, 'github', '42', NULL, '2026-01-01T00:00:00.000Z')
        `.execute()
      ).rejects.toThrow()
    })

    test("0005 keeps the users id counter when every user was deleted", async () => {
      const { sql } = await fresh()
      await migrate(sql, migrations.slice(0, 4))
      for (const email of ["a@example.com", "b@example.com"]) {
        await sql`
          INSERT INTO users (email, password_hash, name, created_at, updated_at)
          VALUES (${email}, 'h', '', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
        `
      }
      await sql`DELETE FROM users`
      await migrate(sql, migrations.slice(0, 5))
      const [next] = await sql`
        INSERT INTO users (email, password_hash, name, created_at, updated_at)
        VALUES ('c@example.com', 'h', '', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
        RETURNING id
      `
      expect(next.id).toBe(3)
    })

    test("0006 allows one identity per provider per user", async () => {
      const { sql } = await fresh()
      await migrate(sql, migrations.slice(0, 5))
      const [user] = await sql`
        INSERT INTO users (email, password_hash, name, created_at, updated_at)
        VALUES ('a@example.com', NULL, '', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
        RETURNING id
      `
      await sql`
        INSERT INTO identities (user_id, provider, provider_user_id, email, created_at)
        VALUES (${user.id}, 'google', 'g-1', NULL, '2026-01-01T00:00:00.000Z')
      `
      expect(await migrate(sql, migrations.slice(0, 6))).toEqual(["0006_identity_per_provider"])
      await expect(
        sql`
          INSERT INTO identities (user_id, provider, provider_user_id, email, created_at)
          VALUES (${user.id}, 'google', 'g-2', NULL, '2026-01-01T00:00:00.000Z')
        `.execute()
      ).rejects.toThrow()
      // Another provider on the same user is fine.
      await sql`
        INSERT INTO identities (user_id, provider, provider_user_id, email, created_at)
        VALUES (${user.id}, 'github', '42', NULL, '2026-01-01T00:00:00.000Z')
      `
    })

    test("0007 creates waitlist with a unique email and a www default source", async () => {
      const { sql } = await fresh()
      await migrate(sql, migrations.slice(0, 6))
      expect(await migrate(sql, migrations.slice(0, 7))).toEqual(["0007_waitlist"])
      const [row] = await sql`
        INSERT INTO waitlist (email, created_at) VALUES ('a@example.com', '2026-01-01T00:00:00.000Z')
        RETURNING *
      `
      expect(row).toMatchObject({ id: 1, email: "a@example.com", source: "www" })
      await expect(
        sql`
          INSERT INTO waitlist (email, source, created_at)
          VALUES ('a@example.com', 'docs', '2026-01-01T00:00:00.000Z')
        `.execute()
      ).rejects.toThrow()
    })

    test("0008 creates workspaces, memberships and invitations", async () => {
      const { sql } = await fresh()
      await migrate(sql, migrations.slice(0, 7))
      expect(await migrate(sql, migrations.slice(0, 8))).toEqual(["0008_workspaces"])
      const [user] = await sql`
        INSERT INTO users (email, password_hash, name, created_at, updated_at)
        VALUES ('a@example.com', 'h', '', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
        RETURNING *
      `
      const [workspace] = await sql`
        INSERT INTO workspaces (name, slug, created_by, created_at)
        VALUES ('Ada''s Team', 'ada-s-team', ${user.id}, '2026-01-01T00:00:00.000Z')
        RETURNING *
      `
      await sql`
        INSERT INTO memberships (workspace_id, user_id, role, created_at)
        VALUES (${workspace.id}, ${user.id}, 'owner', '2026-01-01T00:00:00.000Z')
      `
      await expect(
        sql`
          INSERT INTO memberships (workspace_id, user_id, role, created_at)
          VALUES (${workspace.id}, ${user.id}, 'bogus', '2026-01-01T00:00:00.000Z')
        `.execute()
      ).rejects.toThrow()
      const [invitation] = await sql`
        INSERT INTO invitations (workspace_id, email, role, token_hash, invited_by, expires_at, created_at)
        VALUES (${workspace.id}, 'b@example.com', 'member', 'h1', ${user.id},
          '2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
        RETURNING *
      `
      expect(invitation).toMatchObject({
        email: "b@example.com",
        role: "member",
        accepted_at: null,
      })
      // A second pending invitation to the same address in the same workspace violates the
      // partial unique index, with the message invitations.create retries on.
      const duplicate = await sql`
        INSERT INTO invitations (workspace_id, email, role, token_hash, invited_by, expires_at, created_at)
        VALUES (${workspace.id}, 'b@example.com', 'viewer', 'h2', ${user.id},
          '2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
      `
        .execute()
        .then(
          () => null,
          (error: unknown) => error
        )
      expect(isPendingInviteTaken(duplicate)).toBe(true)
    })

    test("0009 gives every note owner a workspace, drops orphans and requires workspace_id", async () => {
      const { sql } = await fresh()
      await migrate(sql, migrations.slice(0, 8))
      const [user] = await sql`
        INSERT INTO users (email, password_hash, name, created_at, updated_at)
        VALUES ('ada@example.com', 'h', 'Ada', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
        RETURNING id
      `
      const [nameless] = await sql`
        INSERT INTO users (email, password_hash, name, created_at, updated_at)
        VALUES ('grace@example.com', 'h', '', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
        RETURNING id
      `
      for (const [title, owner] of [
        ["one", user.id],
        ["two", user.id],
        ["orphan", null],
        ["hers", nameless.id],
      ]) {
        await sql`
          INSERT INTO notes (title, body, created_at, user_id)
          VALUES (${title}, '', '2026-01-01T00:00:00.000Z', ${owner})
        `
      }
      expect(await migrate(sql, migrations.slice(0, 9))).toEqual(["0009_notes_workspace"])

      const workspaces = await sql`SELECT * FROM workspaces ORDER BY id`
      expect(workspaces.map((w: { name: string }) => w.name)).toEqual([
        "Ada's workspace",
        "grace's workspace",
      ])
      expect(workspaces[0]).toMatchObject({ slug: "ada-s-workspace", created_by: user.id })
      const memberships =
        await sql`SELECT workspace_id, user_id, role FROM memberships ORDER BY user_id`
      expect(memberships).toEqual([
        { workspace_id: workspaces[0].id, user_id: user.id, role: "owner" },
        { workspace_id: workspaces[1].id, user_id: nameless.id, role: "owner" },
      ])
      const notes = await sql`SELECT id, title, workspace_id FROM notes ORDER BY id`
      expect(notes).toEqual([
        { id: 1, title: "one", workspace_id: workspaces[0].id },
        { id: 2, title: "two", workspace_id: workspaces[0].id },
        { id: 4, title: "hers", workspace_id: workspaces[1].id },
      ])
      // The id counter carries on past every id ever handed out, the deleted orphan's included.
      const [next] = await sql`
        INSERT INTO notes (title, body, created_at, user_id, workspace_id)
        VALUES ('next', '', '2026-01-01T00:00:00.000Z', ${user.id}, ${workspaces[0].id})
        RETURNING id
      `
      expect(next.id).toBe(5)
      await expect(
        sql`INSERT INTO notes (title, body, created_at) VALUES ('t', '', '2026-01-01T00:00:00.000Z')`.execute()
      ).rejects.toThrow()
    })

    test("0009 strips control characters from the name it builds", async () => {
      const { sql } = await fresh()
      await migrate(sql, migrations.slice(0, 8))
      const [user] = await sql`
        INSERT INTO users (email, password_hash, name, created_at, updated_at)
        VALUES ('tab@example.com', 'h', ${"Ada\tLovelace"}, '2026-01-01T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z')
        RETURNING id
      `
      await sql`
        INSERT INTO notes (title, body, created_at, user_id)
        VALUES ('one', '', '2026-01-01T00:00:00.000Z', ${user.id})
      `
      await migrate(sql, migrations.slice(0, 9))
      const [workspace] = await sql`SELECT name FROM workspaces`
      expect(workspace.name).toBe("AdaLovelace's workspace")
    })

    test("0025 adds the email-change token purposes and requested_at, and keeps the ceremony column", async () => {
      const { sql } = await fresh()
      await migrate(sql, migrations.slice(0, 24))
      const [user] = await sql`
        INSERT INTO users (email, password_hash, name, created_at, updated_at)
        VALUES ('a@example.com', 'h', '', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
        RETURNING id
      `
      // A purpose from before 0025 still works going in.
      await sql`
        INSERT INTO tokens (user_id, purpose, token_hash, expires_at, created_at)
        VALUES (${user.id}, 'email_verify', 'pre-0025', '2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
      `
      expect(await migrate(sql, migrations.slice(0, 25))).toEqual(["0025_email_change"])

      const [kept] = await sql`SELECT * FROM tokens WHERE token_hash = 'pre-0025'`
      expect(kept).toMatchObject({ user_id: user.id, purpose: "email_verify" })

      await sql`
        INSERT INTO tokens (user_id, purpose, token_hash, expires_at, created_at, email)
        VALUES (${user.id}, 'email_change', 't-change', '2026-01-02T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z', 'new@example.com')
      `
      await sql`
        INSERT INTO tokens (user_id, purpose, token_hash, expires_at, created_at)
        VALUES (${user.id}, 'email_change_cancel', 't-cancel', '2026-01-02T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z')
      `
      await sql`
        INSERT INTO tokens (user_id, purpose, token_hash, expires_at, created_at, email, requested_at)
        VALUES (${user.id}, 'email_change_revert', 't-revert', '2026-01-09T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z', 'a@example.com', '2025-12-31T23:00:00.000Z')
      `
      const rows: Array<{ purpose: string; email: string | null; requested_at: string | null }> =
        await sql`
          SELECT purpose, email, requested_at FROM tokens
          WHERE token_hash IN ('t-change', 't-cancel', 't-revert', 'pre-0025')
          ORDER BY token_hash
        `
      expect(rows).toEqual([
        { purpose: "email_verify", email: null, requested_at: null },
        { purpose: "email_change_cancel", email: null, requested_at: null },
        { purpose: "email_change", email: "new@example.com", requested_at: null },
        {
          purpose: "email_change_revert",
          email: "a@example.com",
          requested_at: "2025-12-31T23:00:00.000Z",
        },
      ])

      // Still rejected: an unknown purpose, and the earlier passkey ceremony CHECK still applies.
      await expect(
        sql`
          INSERT INTO tokens (user_id, purpose, token_hash, expires_at, created_at)
          VALUES (${user.id}, 'bogus', 't-bogus', '2026-01-02T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
        `.execute()
      ).rejects.toThrow()
      await expect(
        sql`
          INSERT INTO tokens (user_id, purpose, token_hash, expires_at, created_at, ceremony)
          VALUES (${user.id}, 'passkey_challenge', 't-ceremony', '2026-01-02T00:00:00.000Z',
            '2026-01-01T00:00:00.000Z', 'bogus')
        `.execute()
      ).rejects.toThrow()
      await sql`
        INSERT INTO tokens (user_id, purpose, token_hash, expires_at, created_at, ceremony)
        VALUES (${user.id}, 'passkey_challenge', 't-ceremony-ok', '2026-01-02T00:00:00.000Z',
          '2026-01-01T00:00:00.000Z', 'register')
      `
    })

    test("0026 adds the four suspension columns, all nullable", async () => {
      const { sql } = await fresh()
      await migrate(sql, migrations.slice(0, 25))
      const [admin] = await sql`
        INSERT INTO users (email, password_hash, name, created_at, updated_at)
        VALUES ('admin@example.com', 'h', '', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
        RETURNING id
      `
      const [user] = await sql`
        INSERT INTO users (email, password_hash, name, created_at, updated_at)
        VALUES ('a@example.com', 'h', '', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
        RETURNING id
      `
      expect(await migrate(sql, migrations.slice(0, 26))).toEqual(["0026_suspensions"])

      // A pre-existing row reads every new column as null.
      const [untouched] = await sql`
        SELECT suspended_at, suspended_until, suspension_reason, suspended_by
        FROM users WHERE id = ${user.id}
      `
      expect(untouched).toEqual({
        suspended_at: null,
        suspended_until: null,
        suspension_reason: null,
        suspended_by: null,
      })

      await sql`
        UPDATE users SET suspended_at = '2026-02-01T00:00:00.000Z',
          suspended_until = '2026-03-01T00:00:00.000Z', suspension_reason = 'abuse report',
          suspended_by = ${admin.id}
        WHERE id = ${user.id}
      `
      const [suspended] = await sql`
        SELECT suspended_at, suspended_until, suspension_reason, suspended_by
        FROM users WHERE id = ${user.id}
      `
      expect(suspended).toEqual({
        suspended_at: "2026-02-01T00:00:00.000Z",
        suspended_until: "2026-03-01T00:00:00.000Z",
        suspension_reason: "abuse report",
        suspended_by: admin.id,
      })

      // No foreign key: deleting the admin leaves the reference dangling rather than cascading or
      // refusing — `users.purge` is the one that nulls it out.
      await sql`DELETE FROM users WHERE id = ${admin.id}`
      const [afterAdminGone] = await sql`
        SELECT suspended_by FROM users WHERE id = ${user.id}
      `
      expect(Number(afterAdminGone.suspended_by)).toBe(admin.id)
    })

    test("0027 adds api_keys (cascading with its workspace) and notes.api_key_id", async () => {
      const { sql } = await fresh()
      await migrate(sql, migrations.slice(0, 26))
      const [workspace] = await sql`
        INSERT INTO workspaces (name, slug, created_at) VALUES ('w', 'w', '2026-01-01T00:00:00.000Z')
        RETURNING id
      `
      const [note] = await sql`
        INSERT INTO notes (title, body, created_at, workspace_id)
        VALUES ('before', '', '2026-01-01T00:00:00.000Z', ${workspace.id})
        RETURNING id
      `
      expect(await migrate(sql, migrations.slice(0, 27))).toEqual(["0027_api_keys"])

      const [untouched] = await sql`SELECT api_key_id FROM notes WHERE id = ${note.id}`
      expect(untouched).toEqual({ api_key_id: null })

      const insert = (prefix: string, name = "CI") => sql`
        INSERT INTO api_keys (workspace_id, name, prefix, secret_hash, scopes, created_by, created_at)
        VALUES (${workspace.id}, ${name}, ${prefix}, ${"a".repeat(64)}, '["notes:read"]', 999,
          '2026-01-01T00:00:00.000Z')
        RETURNING *
      `
      const [key] = await insert("Abcdef12")
      expect(key).toMatchObject({
        workspace_id: workspace.id,
        name: "CI",
        prefix: "Abcdef12",
        scopes: '["notes:read"]',
        // No foreign key: a creator that does not exist (purged) is kept as written.
        created_by: 999,
        expires_at: null,
        last_used_at: null,
        revoked_at: null,
      })
      // The prefix is unique and exactly 8 characters; the name 1–60.
      await expect(insert("Abcdef12").execute()).rejects.toThrow()
      await expect(insert("short").execute()).rejects.toThrow()
      await expect(insert("Zbcdef12", "").execute()).rejects.toThrow()
      await expect(insert("Ybcdef12", "x".repeat(61)).execute()).rejects.toThrow()

      // A note can name a key, and nothing cascades from the key to the note.
      await sql`UPDATE notes SET api_key_id = ${key.id} WHERE id = ${note.id}`
      await sql`DELETE FROM api_keys WHERE id = ${key.id}`
      const [kept] = await sql`SELECT api_key_id FROM notes WHERE id = ${note.id}`
      expect(Number(kept.api_key_id)).toBe(key.id)

      const indexes =
        engine === "postgres"
          ? await sql`SELECT indexname AS name FROM pg_indexes WHERE tablename = 'api_keys'`
          : await sql`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'api_keys'`
      expect(indexes.map((r: { name: string }) => r.name)).toContain("api_keys_workspace_id")
    })

    test("0028 adds webhook_endpoints and webhook_deliveries, cascading from the workspace", async () => {
      const { sql } = await fresh()
      await migrate(sql, migrations.slice(0, 27))
      const [workspace] = await sql`
        INSERT INTO workspaces (name, slug, created_at) VALUES ('w', 'w', '2026-01-01T00:00:00.000Z')
        RETURNING id
      `
      expect(await migrate(sql, migrations.slice(0, 28))).toEqual(["0028_webhooks"])

      const insert = (
        extra: { url?: string; description?: string | null; events?: string; reason?: string } = {}
      ) => sql`
        INSERT INTO webhook_endpoints (workspace_id, url, description, events, secret, created_by,
          created_at, disabled_reason)
        VALUES (${workspace.id}, ${extra.url ?? "https://example.com/hook"},
          ${extra.description === undefined ? null : extra.description},
          ${extra.events ?? '["note.created"]'}, 'v1:iv:ct', 999, '2026-01-01T00:00:00.000Z',
          ${extra.reason ?? null})
        RETURNING *
      `
      const [endpoint] = await insert()
      expect(endpoint).toMatchObject({
        workspace_id: workspace.id,
        url: "https://example.com/hook",
        description: null,
        events: '["note.created"]',
        secret: "v1:iv:ct",
        // No foreign key: a creator that does not exist (purged) is kept as written.
        created_by: 999,
        enabled: 1,
        consecutive_failures: 0,
        disabled_at: null,
        disabled_reason: null,
      })
      // url 1–2000, description ≤ 200, at least one event, a known disabled reason.
      await expect(insert({ url: "" }).execute()).rejects.toThrow()
      await expect(insert({ url: `https://a/${"x".repeat(1991)}` }).execute()).rejects.toThrow()
      await expect(insert({ description: "x".repeat(201) }).execute()).rejects.toThrow()
      await expect(insert({ events: "[]" }).execute()).rejects.toThrow()
      await expect(insert({ reason: "bored" }).execute()).rejects.toThrow()
      for (const reason of ["failures", "gone", "manual"]) await insert({ reason })

      const delivery = (error: string | null) => sql`
        INSERT INTO webhook_deliveries (endpoint_id, event_id, event_type, attempt, status, error,
          duration_ms, created_at)
        VALUES (${endpoint.id}, 'msg_x', 'note.created', 1, ${error ? null : 200}, ${error}, 12,
          '2026-01-01T00:00:00.000Z')
        RETURNING *
      `
      const [row] = await delivery(null)
      expect(row).toMatchObject({ endpoint_id: endpoint.id, status: 200, error: null })
      for (const error of ["timeout", "network", "blocked", "redirect", "http"])
        await delivery(error)
      await expect(delivery("body: secret").execute()).rejects.toThrow()

      const indexes = async (table: string) =>
        (engine === "postgres"
          ? await sql`SELECT indexname AS name FROM pg_indexes WHERE tablename = ${table}`
          : await sql`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = ${table}`
        ).map((r: { name: string }) => r.name)
      expect(await indexes("webhook_endpoints")).toContain("webhook_endpoints_workspace_id")
      expect(await indexes("webhook_deliveries")).toContain("webhook_deliveries_endpoint_created")
      // webhooks.prune deletes by created_at alone: its own index, not a full scan.
      expect(await indexes("webhook_deliveries")).toContain("webhook_deliveries_created_at")

      if (engine === "postgres") {
        // The foreign keys cascade: deleting the workspace removes endpoints and their deliveries.
        await sql`DELETE FROM workspaces WHERE id = ${workspace.id}`
        expect(await sql`SELECT id FROM webhook_endpoints`).toEqual([])
        expect(await sql`SELECT id FROM webhook_deliveries`).toEqual([])
      }
    })

    test("0029 adds a nullable, unconstrained audit_log.workspace_id and its index", async () => {
      const { sql } = await fresh()
      await migrate(sql, migrations.slice(0, 28))
      const [before] = await sql`
        INSERT INTO audit_log (at, actor_user_id, action)
        VALUES ('2026-01-01T00:00:00.000Z', NULL, 'workspace.renamed')
        RETURNING id
      `
      expect(await migrate(sql, migrations.slice(0, 29))).toEqual(["0029_audit_workspace"])
      // No backfill: a row written before the column reads as belonging to no workspace.
      const [old] = await sql`SELECT workspace_id FROM audit_log WHERE id = ${before.id}`
      expect(old.workspace_id).toBeNull()
      // No foreign key: a workspace that never existed (or was deleted) is kept as written.
      const [row] = await sql`
        INSERT INTO audit_log (at, actor_user_id, action, workspace_id)
        VALUES ('2026-01-02T00:00:00.000Z', NULL, 'workspace.renamed', 999)
        RETURNING workspace_id
      `
      expect(Number(row.workspace_id)).toBe(999)
      const indexes =
        engine === "postgres"
          ? await sql`SELECT indexname AS name FROM pg_indexes WHERE tablename = 'audit_log'`
          : await sql`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'audit_log'`
      expect(indexes.map((r: { name: string }) => r.name)).toContain("audit_log_workspace")
    })

    test("0030 adds workspaces.require_two_factor, 0 by default and only 0 or 1", async () => {
      const { sql } = await fresh()
      await migrate(sql, migrations.slice(0, 29))
      const [before] = await sql`
        INSERT INTO workspaces (name, slug, created_at) VALUES ('w', 'w', '2026-01-01T00:00:00.000Z')
        RETURNING id
      `
      expect(await migrate(sql, migrations.slice(0, 30))).toEqual([
        "0030_workspace_require_two_factor",
      ])
      // An existing workspace reads as not requiring it, like a new one.
      const [old] = await sql`SELECT require_two_factor FROM workspaces WHERE id = ${before.id}`
      expect(Number(old.require_two_factor)).toBe(0)
      const [added] = await sql`
        INSERT INTO workspaces (name, slug, created_at) VALUES ('x', 'x', '2026-01-01T00:00:00.000Z')
        RETURNING require_two_factor
      `
      expect(Number(added.require_two_factor)).toBe(0)
      await sql`UPDATE workspaces SET require_two_factor = 1 WHERE id = ${before.id}`
      const [on] = await sql`SELECT require_two_factor FROM workspaces WHERE id = ${before.id}`
      expect(Number(on.require_two_factor)).toBe(1)
      await expect(
        sql`UPDATE workspaces SET require_two_factor = 2 WHERE id = ${before.id}`.execute()
      ).rejects.toThrow()
    })

    test("0031 adds workspaces.invite_domains, '[]' (any address) for every workspace", async () => {
      const { sql } = await fresh()
      await migrate(sql, migrations.slice(0, 30))
      const [before] = await sql`
        INSERT INTO workspaces (name, slug, created_at) VALUES ('w', 'w', '2026-01-01T00:00:00.000Z')
        RETURNING id
      `
      expect(await migrate(sql, migrations.slice(0, 31))).toEqual(["0031_workspace_invite_domains"])
      // An existing workspace reads as allowing any address, like a new one.
      const [old] = await sql`SELECT invite_domains FROM workspaces WHERE id = ${before.id}`
      expect(old.invite_domains).toBe("[]")
      const [added] = await sql`
        INSERT INTO workspaces (name, slug, created_at) VALUES ('x', 'x', '2026-01-01T00:00:00.000Z')
        RETURNING invite_domains
      `
      expect(added.invite_domains).toBe("[]")
      await expect(
        sql`UPDATE workspaces SET invite_domains = NULL WHERE id = ${before.id}`.execute()
      ).rejects.toThrow()
    })

    test("0032 adds notifications: no foreign keys, nullable workspace and read_at, two indexes", async () => {
      const { sql } = await fresh()
      await migrate(sql, migrations.slice(0, 31))
      expect(await migrate(sql, migrations.slice(0, 32))).toEqual(["0032_notifications"])
      // No foreign keys: a user or workspace that does not exist (or was deleted) is kept as written.
      const [row] = await sql`
        INSERT INTO notifications (user_id, workspace_id, type, data, created_at)
        VALUES (999, 888, 'member.removed', '{"workspaceName":"W"}', '2026-01-01T00:00:00.000Z')
        RETURNING *
      `
      expect(row).toMatchObject({ type: "member.removed", read_at: null })
      expect(Number(row.user_id)).toBe(999)
      expect(Number(row.workspace_id)).toBe(888)
      const [personal] = await sql`
        INSERT INTO notifications (user_id, type, data, created_at)
        VALUES (999, 'export.ready', '{}', '2026-01-01T00:00:00.000Z')
        RETURNING workspace_id
      `
      expect(personal.workspace_id).toBeNull()
      for (const missing of ["user_id", "type", "data", "created_at"]) {
        const columns = ["user_id", "type", "data", "created_at"].filter((c) => c !== missing)
        const values = columns.map((c) => (c === "user_id" ? "1" : `'x'`))
        await expect(
          sql
            .unsafe(
              `INSERT INTO notifications (${columns.join(", ")}) VALUES (${values.join(", ")})`
            )
            .execute()
        ).rejects.toThrow()
      }
      const indexes =
        engine === "postgres"
          ? await sql`SELECT indexname AS name FROM pg_indexes WHERE tablename = 'notifications'`
          : await sql`SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'notifications'`
      const names = indexes.map((r: { name: string }) => r.name)
      expect(names).toContain("notifications_user_created")
      expect(names).toContain("notifications_user_read")
      expect(names).toContain("notifications_created_at")

      // notifications.prune's statement (queries/notifications.ts) is one created_at range, so
      // the planner can run it on notifications_created_at instead of scanning the table.
      // Postgres prefers a sequential scan on a table this small, so it is turned off for the
      // EXPLAIN: what is checked is that the index is usable, not today's cost estimate.
      const prune = `
        DELETE FROM notifications
        WHERE created_at < '2026-01-01T00:00:00.000Z'
          AND (read_at IS NOT NULL OR created_at < '2025-11-01T00:00:00.000Z')
      `
      const plan =
        engine === "postgres"
          ? await sql.begin(async (tx) => {
              await tx.unsafe("SET LOCAL enable_seqscan = off")
              return tx.unsafe(`EXPLAIN ${prune}`)
            })
          : await sql.unsafe(`EXPLAIN QUERY PLAN ${prune}`)
      const text = JSON.stringify(plan)
      expect(text).toContain("notifications_created_at")
      expect(text).not.toContain("Seq Scan")
      if (engine === "sqlite") expect(text).toMatch(/SEARCH notifications USING INDEX/)
    })

    test("0033 adds notification_preferences: one row per user and type, no foreign key", async () => {
      const { sql } = await fresh()
      await migrate(sql, migrations.slice(0, 32))
      expect(await migrate(sql, migrations.slice(0, 33))).toEqual(["0033_notification_preferences"])
      const at = "2026-01-01T00:00:00.000Z"
      // No foreign key: a user that does not exist is kept as written.
      const [row] = await sql`
        INSERT INTO notification_preferences (user_id, type, email_enabled, updated_at)
        VALUES (999, 'plan.changed', 0, ${at})
        RETURNING *
      `
      expect(row).toMatchObject({ type: "plan.changed", updated_at: at })
      expect(Number(row.user_id)).toBe(999)
      expect(Number(row.email_enabled)).toBe(0)
      // Another type for the same user is its own row; the same pair twice is refused.
      await sql`
        INSERT INTO notification_preferences (user_id, type, email_enabled, updated_at)
        VALUES (999, 'member.removed', 1, ${at})
      `
      await expect(
        sql`
          INSERT INTO notification_preferences (user_id, type, email_enabled, updated_at)
          VALUES (999, 'plan.changed', 1, ${at})
        `.execute()
      ).rejects.toThrow()
      await expect(
        sql`
          INSERT INTO notification_preferences (user_id, type, email_enabled, updated_at)
          VALUES (1, 'plan.changed', 2, ${at})
        `.execute()
      ).rejects.toThrow()
      for (const missing of ["user_id", "type", "email_enabled", "updated_at"]) {
        const columns = ["user_id", "type", "email_enabled", "updated_at"].filter(
          (c) => c !== missing
        )
        const values = columns.map((c) => (c === "user_id" || c === "email_enabled" ? "1" : "'x'"))
        await expect(
          sql
            .unsafe(
              `INSERT INTO notification_preferences (${columns.join(", ")}) VALUES (${values.join(", ")})`
            )
            .execute()
        ).rejects.toThrow()
      }
    })

    test("the shipped list migrates a fresh database and notes accept inserts", async () => {
      const { sql } = await fresh()
      expect(await migrate(sql, migrations)).toEqual([
        "0001_notes",
        "0002_auth",
        "0003_notes_owner",
        "0004_email_verification",
        "0005_identities",
        "0006_identity_per_provider",
        "0007_waitlist",
        "0008_workspaces",
        "0009_notes_workspace",
        "0010_billing",
        "0011_admin",
        "0012_telemetry",
        "0013_two_factor",
        "0014_files",
        "0015_jobs",
        "0016_analytics",
        "0017_user_locale",
        "0018_sessions_revoked_at",
        "0019_privacy",
        "0020_support",
        "0021_job_applications",
        "0022_jobs_request_id",
        "0023_jobs_name_index",
        "0024_passkeys",
        "0025_email_change",
        "0026_suspensions",
        "0027_api_keys",
        "0028_webhooks",
        "0029_audit_workspace",
        "0030_workspace_require_two_factor",
        "0031_workspace_invite_domains",
        "0032_notifications",
        "0033_notification_preferences",
        "0034_booking",
        "0035_group_event_offering",
        "0036_leads",
        "0037_booking_terms",
      ])
      const [workspace] = await sql`
        INSERT INTO workspaces (name, slug, created_at) VALUES ('w', 'w', '2026-01-01T00:00:00.000Z')
        RETURNING id
      `
      const [row] = await sql`
        INSERT INTO notes (title, body, created_at, workspace_id)
        VALUES ('t', 'b', '2026-01-01T00:00:00.000Z', ${workspace.id})
        RETURNING *
      `
      expect(row).toMatchObject({ id: 1, title: "t", body: "b" })
    })

    if (engine === "postgres") {
      test("two processes migrating at once apply each migration once", async () => {
        const { url } = await fresh()
        const a = new SQL(url)
        const b = new SQL(url)
        cleanups.unshift(async () => {
          await a.close()
          await b.close()
        })
        let runs = 0
        const list = [
          step("0001_slow", async () => {
            runs++
            await Bun.sleep(300)
          }),
        ]
        const [ra, rb] = await Promise.all([migrate(a, list), migrate(b, list)])
        expect([...ra, ...rb]).toEqual(["0001_slow"])
        expect(runs).toBe(1)
        expect(await names(a)).toEqual(["0001_slow"])
      })
    }
  })
}

describe("the migrations directory", () => {
  test("every file in src/migrations/ is in the list, in order", async () => {
    const files = [
      ...new Bun.Glob("[0-9][0-9][0-9][0-9]_*.ts").scanSync(`${import.meta.dir}/migrations`),
    ]
      .map((f) => f.replace(/\.ts$/, ""))
      .sort()
    expect(migrations.map((m) => m.name)).toEqual(files)
    expect(files.length).toBeGreaterThan(0)
    for (const name of files) expect(name).toMatch(/^\d{4}_[a-z0-9_]+$/)
  })
})

describe("createDb", () => {
  test("an unsupported engine fails at creation, before any query", () => {
    expect(() => createDb("mysql://root@localhost/app")).toThrow(
      "Unsupported DATABASE_URL: apps/api supports sqlite:// and postgres://"
    )
  })
})

describe("db:migrate", () => {
  test("an unreachable database is one clear line and exit 1", async () => {
    const child = Bun.spawn([process.execPath, `${import.meta.dir}/migrate-cli.ts`], {
      env: { ...process.env, DATABASE_URL: "postgres://nobody:nothing@127.0.0.1:1/none" },
      stdout: "pipe",
      stderr: "pipe",
    })
    const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()])
    expect(code).toBe(1)
    expect(stderr).toContain("migration failed: ")
    expect(stderr).not.toContain("    at ")
  })

  test("a fresh SQLite file is migrated and reported; a second run reports nothing", async () => {
    // The same relative form `bun dev` uses (DATABASE_URL=sqlite://.data/api.db), from apps/api.
    const cwd = `${import.meta.dir}/..`
    const dir = `.data/test-${crypto.randomUUID()}`
    const env = { ...process.env, DATABASE_URL: `sqlite://${dir}/api.db` }
    const run = async () => {
      const child = Bun.spawn([process.execPath, "src/migrate-cli.ts"], {
        cwd,
        env,
        stdout: "pipe",
        stderr: "pipe",
      })
      return { code: await child.exited, out: await new Response(child.stdout).text() }
    }
    expect(await run()).toMatchObject({
      code: 0,
      out: expect.stringMatching(/migration applied.*0001_notes/),
    })
    expect(await run()).toMatchObject({
      code: 0,
      out: expect.stringContaining("no migrations to apply"),
    })
    await Bun.$`rm -rf ${cwd}/${dir}`
  })
})
