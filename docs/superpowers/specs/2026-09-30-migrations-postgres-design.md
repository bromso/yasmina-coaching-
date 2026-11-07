# Versioned migrations and Postgres (Phase 3b)

**Status:** approved design, pending implementation plan
**Date:** 2026-09-30
**Roadmap:** `docs/ROADMAP.md`, Phase 3 — sub-project 3b (3a shipped in #34; 3c: Next app headers
+ error pages follows)

## Intent

`apps/api` creates its schema with `CREATE TABLE IF NOT EXISTS` on every start, so the first real
schema change (a new column, an index) silently does nothing to an existing database. And its DDL is
SQLite-only, so the Postgres the README long promised never worked. This gives the data layer
versioned, repeatable, forward-only migrations and makes Postgres a tested engine — on the
existing `Bun.sql` data layer, with no ORM and no new dependency.

**Success criteria**

- A new migration file applies exactly once, on SQLite and on Postgres, and is recorded.
- The service refuses to start on a database that records a migration this build does not know.
- The whole `apps/api` test suite passes on in-memory SQLite (default) and on a real Postgres.
- CI runs the api tests against Postgres whenever `apps/api`, `api-contract` or `service-kit`
  change (verified locally until CI is available again on 2026-10-01).
- Existing dev databases created by the old `CREATE TABLE IF NOT EXISTS` keep working with no
  manual step.
- The docs name exactly the supported engines: SQLite and Postgres.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Engines | SQLite (default, dev, small deploys) and Postgres (production) | MySQL has no `INSERT … RETURNING`; supporting it means a second write path for every query. Dropped from the docs. |
| Mechanism | A small in-repo runner over `Bun.sql` | ~80 lines, no dependency, matches "prefer Bun built-ins"; libraries do not speak `Bun.sql`. Drizzle would replace the data layer. |
| Direction | Forward-only, no down migrations | A rollback is a new migration; standard for services. |
| When | At startup (as today) and on demand (`bun run --filter @repo/api db:migrate`) | Startup keeps `bun dev` zero-setup; the script serves deploys and CI. Not switchable: a service on an unmigrated database is never intended. |
| Concurrency | Postgres: `pg_advisory_xact_lock` inside the migration transaction; SQLite: the transaction is already exclusive | Two replicas starting together: one migrates, the other waits and finds nothing to do. |
| Test isolation on Postgres | One throwaway database per test server, created and dropped by the test helper | Keeps the in-memory-SQLite isolation model; no test hooks in production code. |

Verified before design (Bun 1.4.2, Postgres 17): `sql.options.adapter` reports `"sqlite"` /
`"postgres"`; `sql.begin` transactions roll back on both engines, including DDL on Postgres;
`INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY`, `RETURNING *`, the keyset query and
`pg_advisory_xact_lock` all work; ids arrive as numbers on both.

## Components (`apps/api/src/`)

| File | Responsibility |
|---|---|
| `dialect.ts` | `type Dialect = "sqlite" \| "postgres"`; `dialectOf(sql): Dialect` — reads `sql.options.adapter`, throws `Unsupported DATABASE_URL: apps/api supports sqlite:// and postgres://` for anything else; `ddl.serialId(dialect)` → `"INTEGER PRIMARY KEY AUTOINCREMENT"` or `"INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY"`. |
| `migrations/0001_notes.ts` | `export default { name: "0001_notes", up }` — the current `notes` table via `CREATE TABLE IF NOT EXISTS` (so a pre-existing table is adopted), using `ddl.serialId`. |
| `migrations/index.ts` | `export const migrations: Migration[] = [m0001]` — the explicit ordered list. |
| `migrate.ts` | `type Migration = { name: string; up(sql: SQL, dialect: Dialect): Promise<void> }`; `migrate(sql, migrations, { log? }): Promise<string[]>` (names applied). Creates `schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)` if missing; reads applied names; throws `unknown migration "<name>": this build is older than the database` for any recorded name not in the list; applies the pending ones in list order, each `up` plus its `INSERT INTO schema_migrations` inside one `sql.begin` transaction (Postgres: `SELECT pg_advisory_xact_lock(<constant>)` first in that transaction). |
| `migrate-cli.ts` | `bun run --filter @repo/api db:migrate`: loads env, runs `migrate`, prints each applied name or "nothing to apply", exits 1 with the message on failure. |
| `db.ts` | `createDb(url)`: the SQLite directory handling stays; `migrate()` calls the runner with `migrations`; the inline `CREATE TABLE` is gone; `dialectOf` is called once at creation so an unsupported URL fails at startup. Queries are unchanged (they already work on both engines). |
| `test-db.ts` (test support, not built) | `testDatabase(): Promise<{ url: string; cleanup(): Promise<void> }>` — `TEST_DATABASE_URL` unset → `sqlite://:memory:` and a no-op cleanup; set to a Postgres URL → connects to it, `CREATE DATABASE "t_<random>"`, returns a URL pointing at it, and `DROP DATABASE` on cleanup. |

Rules for migration files: names are `NNNN_snake_case`; a migration receives everything it needs
through `up(sql, dialect)` and never imports application code, so it keeps working when the app
changes; a merged migration is never edited — fix forward with a new one.

## Configuration

- `DATABASE_URL` unchanged: default `sqlite://.data/api.db`; `postgres://…` is now a documented,
  tested value. `apps/api/.env.example` says so.
- `docker-compose.dev.yml`: the Postgres 17 service is uncommented as an opt-in service (with its
  volume); the `dev` service keeps SQLite unless `DATABASE_URL=postgres://postgres:postgres@postgres:5432/app`
  is set on it, as the existing comment describes.
- `docker-compose.yml` (production-like) keeps SQLite on its volume — that is what the boilerplate
  ships; the api README shows the one-line Postgres switch.
- `apps/api/package.json`: `"db:migrate": "bun src/migrate-cli.ts"`.

## Tests

`migrate.test.ts` — parameterised over the engines available (`sqlite://:memory:` always; the
`TEST_DATABASE_URL` throwaway database when set):
- applies pending migrations in order and records them; a second run applies nothing;
- a migration whose `up` throws is rolled back entirely and earlier ones stay applied;
- a recorded name the code does not know → the "older than the database" error;
- a table created beforehand with the old `CREATE TABLE IF NOT EXISTS` DDL is adopted: `0001_notes`
  applies without error and is recorded.

`server.test.ts`: the `start()` helper takes its URL from `testDatabase()`; every `stop()` runs
the cleanup. The suite therefore runs unchanged on SQLite and on Postgres.
`dialect.test.ts`: `dialectOf` on both adapters and the unsupported-URL error; `ddl.serialId`.

## CI

`.github/workflows/ci.yml` gains an `api-postgres` job: `services: postgres` (`postgres:17-alpine`,
healthcheck), `bun --filter @repo/api test` with `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres`.
`scripts/ci-plan.ts` gains a `postgres` output — true when `@repo/api` is affected — and the job
runs on it; the summary `ci` job adds it to `needs`. Verified locally against a Docker Postgres until
CI is available again (2026-10-01); the ledger of that run notes it.

## Docs

- `apps/api/README.md` **Data**: SQLite and Postgres are supported and tested; how to add a
  migration (new file + one line in `migrations/index.ts`); `db:migrate`; the Postgres switch and
  the local test one-liner (`docker run … postgres:17-alpine` + `TEST_DATABASE_URL=… bun --filter @repo/api test`).
- `CLAUDE.md` **Adding an API endpoint**: "a schema change is a new file in `apps/api/src/migrations/`";
  the Packages/Apps text no longer mentions MySQL.
- `docs/ROADMAP.md`: tick "Versioned migrations instead of `CREATE TABLE IF NOT EXISTS`; Postgres
  actually works".

## Out of scope

- MySQL (removed from the docs), down migrations, a seed command, schema diffing / generation.
- Postgres in the production-like `docker-compose.yml`.
- Changing the notes queries or contract.
