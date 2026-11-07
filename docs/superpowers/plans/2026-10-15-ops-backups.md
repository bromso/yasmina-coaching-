# Operations B2 — backups, restore, runbooks — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nightly database backups into the storage bucket, a CLI to back up and restore, a restore proven by round-trip tests on both engines, and runbooks for the common incidents.

**Architecture:** An in-app logical dump (`apps/api/src/backup/`): a streamed, gzipped JSON-lines file with a header naming the engine and the applied migrations, then each table's columns and rows, parents first. Restore migrates an empty database to the backup's migrations, inserts the rows, fixes Postgres sequences and runs the remaining migrations. A `backup.run` job (off unless `BACKUP_ENABLED`) and two CLI scripts share the code.

**Tech Stack:** Bun 1.4 (`Bun.sql`, `Bun.gzipSync`/`CompressionStream`, `bun test`), SQLite and Postgres 17, the existing storage seam and job queue, `@repo/log`, the B1 metrics registry.

**Spec:** `docs/superpowers/specs/2026-10-15-operations-design.md` (section B2, as revised 2026-10-15)

## Global Constraints

- Format: gzip of UTF-8 JSON lines. Line 1 `{"format":"boilerplate-backup","version":1,"engine":"sqlite"|"postgres","createdAt":ISO,"migrations":[names in applied order]}`. Per table: `{"table":name,"columns":[names]}` then one JSON array per row in that column order. A `Uint8Array` value is `{"$b64":"…"}`. Nothing else.
- Excluded tables: `jobs` (queued work would re-run on restore) and `schema_migrations` (the header carries it).
- Dump: one read transaction (Postgres `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`; SQLite the existing `db.transaction`), pages of 1 000 rows ordered by the table's primary key (or `rowid` on SQLite when there is none), tables parents-first by foreign keys (a cycle → alphabetical with a logged warning).
- Restore: refuses a target with any row in any table it would write unless `force`; `force` deletes children-first; refuses a backup listing a migration not in this code's `migrations` list or listing them out of order; inserts in batches of 500; on Postgres afterwards `SELECT setval(pg_get_serial_sequence(t,'id'), COALESCE(MAX(id),1), MAX(id) IS NOT NULL) FROM t` for every table with a serial `id`.
- Keys: `backups/<YYYY-MM-DD>/<engine>-<HHMMSS>.jsonl.gz`, `BACKUP_KEY_PATTERN = /^backups\/\d{4}-\d{2}-\d{2}\/(sqlite|postgres)-\d{6}\.jsonl\.gz$/` (in `apps/api`, not the contract — no client ever sees one). `storage.sweep` never touches `backups/`.
- Env (apps/api `env.ts`): `BACKUP_ENABLED` (`true`/`false`, default false), `BACKUP_RETENTION_DAYS` (integer 1–365, default 14).
- Schedule: `backup.run` at `0 2 * * *`, enqueued only when `BACKUP_ENABLED=true`.
- Metric: `backup_last_success_timestamp_seconds` (gauge) on whichever process runs jobs (the B1 split: the api's `/metrics` when it runs the worker in-process, else the dedicated worker's).
- Implementers never run Playwright or `bun run ci`. Postgres tests run with `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres` when the local container is up (CI's `api-postgres` job runs them).
- Biome clean, zero warnings; commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Conventional Commits ≤ 100 chars.

## Review Focus

1. A restore into a database that already holds data silently mixing two datasets → refuse without `force` (Task 1 test with one existing user).
2. A backup taken mid-write being internally inconsistent (a note whose workspace row is missing) → one read transaction (Task 1 test: writes during a dump do not appear half-way).
3. Postgres inserts after a restore colliding on `id` because sequences still start at 1 → sequences reset (Task 1 test: create a row after restore on Postgres).
4. A huge table loaded into memory at once → paging + streaming (Task 1 test asserts the dump reads in pages, e.g. 2 500 rows → 3 queries, with a spy or by counting).
5. Retention deleting something that isn't a backup (an upload) → only keys matching `BACKUP_KEY_PATTERN` under `backups/` are pruned (Task 2 test with a stray key).

---

### Task 1: Dump and restore core, with round-trip tests

**Files:** Create `apps/api/src/backup/format.ts`, `dump.ts`, `restore.ts`, `tables.ts` (introspection + ordering), `backup.test.ts`.

**Interfaces — Produces:**
- `dumpDatabase(db: Db, opts?: { pageSize?: number; now?: () => Date }): ReadableStream<Uint8Array>` (gzipped) and `dumpToBytes(db, opts?): Promise<Uint8Array>` (tests, small DBs).
- `restoreDatabase(db: Db, source: ReadableStream<Uint8Array> | Uint8Array, opts?: { force?: boolean; log?: Logger }): Promise<{ tables: number; rows: number; migrationsAfter: string[] }>`.
- `listTables(db): Promise<Array<{ name: string; columns: string[]; primaryKey: string[]; parents: string[] }>>` and `orderParentsFirst(tables)`.
- `BackupFormatError` (bad header, unknown/out-of-order migration, malformed line) and `RestoreTargetNotEmpty`.

- [ ] **Step 1: Tests** (`backup.test.ts`, using `start()`/`signUp()` from `test-server.ts` to seed real data through the api — users, a workspace, a second member, notes, a pending invitation, a job application, analytics rows — so every table that the product writes has rows): round trip into a fresh database (`createDb` on a new temp SQLite file, or a fresh Postgres schema/database — see how other Postgres tests isolate) gives identical row counts for every table and identical rows for a sample (users, workspaces, memberships, notes); `jobs` is not in the dump; the header lists exactly the applied migrations; restore into a database with one user throws `RestoreTargetNotEmpty`, and with `force` succeeds and matches; a backup naming an unknown migration throws `BackupFormatError` before writing anything; on Postgres, creating a note after restore succeeds (sequence reset); page size 2 → the dump of 5 notes reads the notes table in 3 pages (count queries through a thin wrapper or a `pageSize` hook); a write committed after the dump's transaction began is absent from that dump; SQLite → Postgres restore when `TEST_DATABASE_URL` is set (skipped otherwise, one-line reason).
- [ ] **Step 2: Run** `cd apps/api && bun test src/backup/backup.test.ts` → FAIL.
- [ ] **Step 3: Implement.** Introspection: SQLite `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`, `PRAGMA table_info(t)`, `PRAGMA foreign_key_list(t)`; Postgres `information_schema.tables` (schema `current_schema()`), `information_schema.columns` (ordinal order), `pg_constraint` / `information_schema.table_constraints` + `key_column_usage` for PKs and FKs. Use `sql.unsafe` only with identifiers quoted by a helper that refuses anything not matching `^[a-z_][a-z0-9_]*$`. Gzip with `CompressionStream("gzip")` (and `DecompressionStream`) so it streams. Line splitting on restore must handle chunks that cut a line.
- [ ] **Step 4: Run** the test file on SQLite and, if the container is up, on Postgres; then `bun test` (full api suite) and `bun run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(api): a portable logical backup and restore of the database`.

---

### Task 2: The nightly `backup.run` job

**Files:** Create `apps/api/src/jobs/builtin/backup.ts` (+ test); Modify `apps/api/src/jobs/registry.ts` (job + schedule, the schedule only when enabled — follow how optional jobs are registered, or give `defineSchedule` an `enabled` the scheduler checks), `apps/api/src/env.ts` (+ `env.test.ts`), `apps/api/src/storage/local.ts` (its `list` skip-filter must accept `BACKUP_KEY_PATTERN` so retention can list them), `apps/api/src/metrics.ts` (`backup_last_success_timestamp_seconds`), `apps/api/src/jobs/builtin/storage.ts` only to assert/comment that the sweep never lists `backups/`.

- [ ] **Step 1: Tests:** with the job run through `drain()`, a backup object appears under `backups/<today>/<engine>-<HHMMSS>.jsonl.gz` and restores (reuse Task 1's helper); retention deletes a backup key older than `BACKUP_RETENTION_DAYS` (write one with an old date key) and keeps a newer one and a stray non-matching key under `backups/`; the metric is set after success; a storage failure reaches `recordFailure` and the job retries; with `BACKUP_ENABLED` unset no `backup.run` is ever scheduled; env parsing for both vars (defaults, bounds, invalid).
- [ ] **Step 2–4:** FAIL → implement → PASS (`bun test`, typecheck in apps/api).
- [ ] **Step 5: Commit** `feat(api): a nightly backup job with retention, off by default`.

---

### Task 3: `backup` and `restore` scripts

**Files:** Create `apps/api/src/backup-cli.ts`, `apps/api/src/restore-cli.ts` (+ tests, spawning them with `Bun.spawn` against temp SQLite files and a local storage dir); Modify `apps/api/package.json` (`"backup": "bun src/backup-cli.ts"`, `"restore": "bun src/restore-cli.ts"`), and the api build if the Docker image should carry them (add both to `bun build` entrypoints so `dist/backup-cli.js` / `dist/restore-cli.js` exist; `scripts/docker.test.ts` may need the new files listed — run `bun test scripts`).

- [ ] **Step 1: Tests:** `backup --out <file>` writes a file that `restore <file>` loads into an empty database; `backup` without `--out` writes to storage (local provider in the test) and prints the key; `restore <key>` reads from storage; `restore` into a non-empty database exits 1 with a message naming `--force`; `--force` succeeds; a missing file/key exits 1 with a clear message; both scripts log through `@repo/log` (json in production); exit codes 0/1.
- [ ] **Step 2–4:** FAIL → implement (reuse `loadEnv`, `createDb`, `createStorage`; never print database URLs or credentials) → PASS.
- [ ] **Step 5: Commit** `feat(api): backup and restore scripts`.

---

### Task 4: Docs — backups, restore drill, runbooks

**Files:** Modify `docs/guides/operations.md` (replace the "Backups and runbooks" stub: turning backups on, what is and isn't in a backup — `jobs` left out, the bucket not copied —, the restore drill step by step for SQLite and Postgres including "pause `storage.sweep` until the bucket is restored to the same point", cross-engine restore, and runbooks: the api will not start (env), a dead-job backlog, the realtime stream cap, mail failing, storage 403s, SQLite `database is locked`, restoring from a backup — each: symptom, the log line or metric to look at, the fix), CLAUDE.md (**Operations** paragraph gains backups; env rows `BACKUP_ENABLED`, `BACKUP_RETENTION_DAYS`; the **Jobs** schedule list gains `backup.run`), `apps/api/README.md`, `.env.example` files, `docker-compose.yml` (pass `BACKUP_ENABLED`, `BACKUP_RETENTION_DAYS` to `api`/`api-worker` like B1's vars), `docs/guides/deploying.md` (replace its one-line backup mention with a pointer), `docs/ROADMAP.md` (Phase 9 B stays unticked until merge; write nothing that claims it merged).

- [ ] **Step 1:** write the docs from the code (read Tasks 1–3's files first).
- [ ] **Step 2:** `bun test scripts`, `bunx biome ci .`.
- [ ] **Step 3: Commit** `docs: backups, the restore drill and runbooks`.
