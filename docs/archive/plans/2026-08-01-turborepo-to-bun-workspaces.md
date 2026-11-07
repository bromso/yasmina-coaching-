# Turborepo → Bun Workspaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Turborepo from the monorepo and orchestrate every task with `bun run --filter`.

**Architecture:** The repo already uses Bun workspaces (`workspaces`, `bun.lock`, `catalog:`, `workspace:*`); Turborepo is only a task-runner layer on top. This plan deletes that layer. Root scripts become `bun run --filter` invocations, Biome runs once at the root instead of fanning out, and Docker's `turbo prune` stage is replaced by `bun install --filter`, which installs a lean workspace subtree.

**Tech Stack:** Bun 1.3.14 workspaces, Biome 2.3, TypeScript 5.9, Next.js 16, Docker.

**Spec:** `docs/plans/2026-08-01-turborepo-to-bun-workspaces-design.md`

## Global Constraints

- Bun version for all verification: **1.3.14**. Root `packageManager` is bumped to `bun@1.3.14` in Task 2.
- `turbopack` is **Next.js Turbopack**, unrelated to Turborepo. Never modify `turbopack:` keys in `apps/app/next.config.mjs:19`, `apps/www/next.config.ts:11`, or the `"turbopack"` entry in `cspell.json:35`.
- `--filter '*'` does **not** match the root package, so a root script may safely delegate to the same script name in workspaces without recursing.
- Packages lacking a script are skipped silently — never add stub scripts to `@repo/ui`, `@repo/tokens`, or `@repo/typescript-config`.
- Leave these files untouched; they only *ignore* `.turbo`/`turbo.json` and are harmless: `.gitignore`, `.dockerignore`, `.claudeignore`, `biome.json`, `cspell.json`, `workspace.code-workspace`, `.editorconfig`.
- Leave `docs/plans/*.md` untouched — historical records.
- **Root `typecheck` covers `@repo/app` and `@repo/www` only.** `@repo/story` has 996 pre-existing type errors that the broken `turbo check-types` was hiding (see Task 2, Step 3). Never fix or suppress them in this migration, and never add `@repo/story` to the root typecheck filter.
- Out of scope: stale `@repo/docs` / `@repo/legal` references in `Makefile`, `k8s/`, and any other file that does not mention Turbo.
- Commit after every task. Conventional Commits (`chore:`, `fix:`, `docs:`, `build:`) — the repo runs commitlint on commit.

## Testing note for this plan

This is an infrastructure migration, so the TDD cycle is: **write the verification command, run it to watch it fail, make the change, run it again to watch it pass.** The commands are the tests. Every task below follows that cycle.

---

### Task 1: Make `typecheck` real

`turbo check-types` has never worked — no package defines a `check-types` script (`@repo/story` defines `typecheck`). This task is first because it is the only one that can surface unknown pre-existing work.

**Files:**
- Modify: `apps/app/package.json` (scripts block)
- Modify: `apps/www/package.json` (scripts block)

**Interfaces:**
- Consumes: nothing.
- Produces: a `typecheck` script in `@repo/app`, `@repo/www`, and (already present) `@repo/story`. Task 2's root `typecheck` script depends on all three existing.

- [ ] **Step 1: Prove the current task is a no-op**

Run: `bun turbo check-types`

Expected: Turbo reports 0 tasks executed / no packages with that script. This is the bug — record the exact output in the commit message.

- [ ] **Step 2: Add the script to `apps/app`**

In `apps/app/package.json`, add `typecheck` to `scripts` immediately after `"start"`:

```json
    "start": "next start --port 3001",
    "typecheck": "tsc --noEmit",
```

- [ ] **Step 3: Add the script to `apps/www`**

In `apps/www/package.json`, add `typecheck` to `scripts` immediately after `"start"`:

```json
    "start": "next start",
    "typecheck": "tsc --noEmit",
```

`apps/story` already has `"typecheck": "tsc --noEmit"` — do not touch it.

Both apps' `tsconfig.json` already set `"noEmit": true`, so no tsconfig changes are needed.

- [ ] **Step 4: Run the real typecheck**

Run: `bun run --filter '*' typecheck`

Expected: `@repo/app`, `@repo/www` and `@repo/story` each run `tsc --noEmit`.

**If the exit code is non-zero, STOP.** These are pre-existing type errors that `turbo check-types` was hiding, not errors this migration introduced. Do not fix them inline and do not suppress them — capture the full output and raise it with the user as a scope decision before continuing to Task 2.

If `tsc` complains about a missing `next-env.d.ts`, run `bun run --filter @repo/app build` once to generate Next's types, then re-run.

- [ ] **Step 5: Commit**

```bash
git add apps/app/package.json apps/www/package.json
git commit -m "fix: add real typecheck scripts to app and www

turbo check-types referenced a script no package defined, so the task
silently did nothing. Both apps now run tsc --noEmit."
```

---

### Task 2: Migrate root package.json scripts

**Files:**
- Modify: `package.json` (`scripts`, `devDependencies`, `keywords`, `packageManager`)

**Interfaces:**
- Consumes: the `typecheck` scripts from Task 1.
- Produces: root scripts `build`, `dev`, `start`, `lint`, `typecheck`, `ci`, `clean` that no longer invoke `turbo`. Tasks 6–10 document these names.

- [ ] **Step 1: Verify the current state fails the target**

Run: `grep -c turbo package.json`

Expected: `15` — the count must reach `0` by Step 6.

- [ ] **Step 2: Replace the scripts block**

In `package.json`, replace these lines:

```json
    "build": "turbo build",
    "build:app": "turbo build --filter @repo/app",
    "build:www": "turbo build --filter @repo/www",
    "build:docs": "turbo build --filter @repo/docs",
    "build:legal": "turbo build --filter @repo/legal",
    "dev": "turbo dev",
    "dev:app": "turbo dev --filter @repo/app",
    "dev:www": "turbo dev --filter @repo/www",
    "start": "turbo start",
```

with:

```json
    "build": "bun run --filter '*' build",
    "build:app": "bun run --filter @repo/app build",
    "build:www": "bun run --filter @repo/www build",
    "dev": "bun run --filter '*' dev",
    "dev:app": "bun run --filter @repo/app dev",
    "dev:www": "bun run --filter @repo/www dev",
    "start": "bun run --filter '*' start",
```

`build:docs` and `build:legal` are deleted outright — `@repo/docs` and `@repo/legal` do not exist in this repo.

- [ ] **Step 3: Replace lint, typecheck, ci and clean**

Replace `"lint": "turbo lint",` with:

```json
    "lint": "biome lint .",
```

Replace `"typecheck": "turbo check-types",` with:

```json
    "typecheck": "bun run --filter @repo/app --filter @repo/www typecheck",
```

**Amended 2026-08-01 after Task 1.** The spec originally said `--filter '*'`. Running the
now-working typecheck revealed **996 pre-existing type errors in `@repo/story`** (which
transitively type-checks `packages/ui`), all of which the broken `turbo check-types` had been
hiding. `@repo/app` and `@repo/www` are clean.

Scoping the root script to the two apps keeps `bun run ci` and `bun run validate` green.
`@repo/story` keeps its own `typecheck` script, so `bun run --filter @repo/story typecheck` still
works and still reports the debt — it is recorded, not suppressed. Do **not** add `@repo/story` to
this filter, and do not fix or suppress those errors as part of this migration.

Replace `"ci": "biome ci . && turbo check-types && turbo build",` with:

```json
    "ci": "biome ci . && bun run typecheck && bun run build",
```

Replace `"clean": "rm -rf .turbo && rm -rf node_modules && rm -rf .next",` with:

```json
    "clean": "rm -rf node_modules apps/*/node_modules packages/*/node_modules apps/*/.next packages/tokens/dist apps/story/storybook-static",
```

The old `clean` deleted a root `.next` that never existed; the real build outputs live under each workspace.

Leave `check`, `check:fix`, `lint:fix`, `format`, `format:fix`, `validate`, `doctor`, `story`, `changeset*`, `release`, `prepare`, `commit`, and `commitlint` exactly as they are.

- [ ] **Step 4: Remove the dependency, keyword, and bump the pin**

Delete this line from `devDependencies`:

```json
    "turbo": "^2.5.5",
```

Delete this line from `keywords`:

```json
    "turborepo",
```

Change `packageManager`:

```json
  "packageManager": "bun@1.3.14",
```

- [ ] **Step 5: Reinstall**

Run: `bun install`

Expected: succeeds; `turbo` is removed from `bun.lock`.

- [ ] **Step 6: Verify turbo is gone from the manifest and from node_modules**

Run: `grep -c turbo package.json; ls node_modules/turbo 2>&1`

Expected: `0`, then `No such file or directory`.

- [ ] **Step 7: Verify the new scripts work**

Run: `bun run typecheck && bun run lint && bun run build`

Expected: all three pass. In the build output, `@repo/tokens` must complete before `@repo/story` starts — this confirms topological ordering.

- [ ] **Step 8: Verify dev starts all three servers**

Run: `bun run dev`

Expected: output lines prefixed `@repo/app dev:`, `@repo/www dev:`, `@repo/story dev:`. Confirm `http://app.localhost:3001`, `http://www.localhost:3000` and `http://localhost:6006` all respond, then stop it with Ctrl-C.

- [ ] **Step 9: Commit**

```bash
git add package.json bun.lock
git commit -m "build: replace turbo task running with bun run --filter

Root scripts now use bun run --filter. Biome runs once at the root for
lint. Drops the turbo devDependency, the turborepo keyword, and the dead
build:docs/build:legal scripts. Also fixes clean, which deleted a root
.next that never existed. Pins bun@1.3.14."
```

---

### Task 2b: Reduce root lint noise (COMPLETED — scope corrected)

> **Corrected 2026-08-01 during execution.** This task was originally titled "Make root lint green"
> on the basis of a measurement of 6 violations in 3 files. That measurement was wrong: Biome
> defaults to `--max-diagnostics=20`, which silently truncated the output. The real figure is
> **70 errors and 415 warnings across 818 files**, concentrated in the vendored
> `packages/ui/src/components/**` pile — the same components that hold the 996 type errors.
>
> Making lint green is therefore **not in scope** for this migration. Task 2b was reduced to the two
> changes that are genuine improvements on their own merits, and shipped at that scope
> (commit `1d73998`):
>
> 1. Exclude `.agents/**/templates/**` from Biome — illustrative skill samples, not source.
> 2. Remove a dead `normalizeName` function and an unused `deriveTarget` parameter from
>    `scripts/install-registry.mjs` (verified dead by grep; file now lints clean and parses).
>
> `bun run lint` still reports the pre-existing debt. Nothing regressed: at merge-base the root
> `check` script was already `biome check .` and `ci` was already `biome ci .`, so both were already
> scanning these paths and already failing. The migration only makes `lint` agree with them.
>
> Steps below are retained as the historical record of what was attempted. **Do not re-run them.**

<details>
<summary>Original Task 2b steps (superseded)</summary>


**Added 2026-08-01 after Task 2.** Moving `lint` from `turbo lint` (per-package) to `biome lint .`
(root) widened coverage to paths the per-package task never scanned, surfacing 6 pre-existing
violations in 3 files. This debt is genuinely pre-existing — at merge-base the root `check` script
was already `biome check .` and `ci` was already `biome ci .`, so both already reported these. The
migration only makes `lint` consistent with them.

The violations: 5 × `lint/correctness/noUnusedVariables`, 1 × `lint/suspicious/noExplicitAny`, in
`.agents/skills/react-hook-form-zod/templates/async-validation.tsx`,
`.agents/skills/react-hook-form-zod/templates/custom-error-display.tsx`, and
`scripts/install-registry.mjs`.

**Files:**
- Modify: `biome.json` (add a `.agents/**/templates/**` ignore)
- Modify: `scripts/install-registry.mjs`

**Interfaces:**
- Consumes: Task 2's `lint` script.
- Produces: a green `bun run lint`, `bun run check` and `bun run ci`.

- [ ] **Step 1: See the failures**

Run: `bun run lint`

Expected: exits 1, reporting the 3 files above.

- [ ] **Step 2: Exclude the skill templates from Biome**

The two `.agents/skills/react-hook-form-zod/templates/*.tsx` files are illustrative code samples
shipped as skill documentation, not source code that ships. They are not compiled, imported, or
executed by anything.

In `biome.json`, add this pattern to **both** `includes` arrays (the file has two — one under
`files`, one under `linter`; the existing entries there use the `"!**/.turbo/**"` negation form):

```json
      "!**/.agents/**/templates/**",
```

Match the surrounding entries' exact style and placement.

- [ ] **Step 3: Verify only the script still fails**

Run: `bun run lint`

Expected: still exits 1, but now reports only `scripts/install-registry.mjs`.

- [ ] **Step 4: Fix the real violations in the script**

`scripts/install-registry.mjs` is a real utility, so fix its violations properly rather than
excluding it.

- For `lint/correctness/noUnusedVariables`: delete the unused binding. If it is an unused caught
  error in `catch (err) {`, and the body does not use it, change it to `catch {`.
- For `lint/suspicious/noExplicitAny`: replace `any` with the specific type where it is knowable;
  if the value is genuinely untyped external JSON, use `unknown` and narrow at the use site.

Do NOT add `biome-ignore` comments, and do NOT add the file to the ignore list — fix the code.

- [ ] **Step 5: Verify everything is green**

Run: `bun run lint && bun run check && echo "LINT+CHECK GREEN"`

Expected: `LINT+CHECK GREEN`.

- [ ] **Step 6: Confirm the script still works**

Run: `bun scripts/install-registry.mjs --help 2>&1 | head -5`

Expected: it runs without a syntax or reference error. If the script takes no `--help`, run it in
whatever no-op or dry-run mode it supports, or at minimum confirm it parses:
`bun build --no-bundle scripts/install-registry.mjs > /dev/null && echo PARSES`.

- [ ] **Step 7: Commit**

```bash
git add biome.json scripts/install-registry.mjs
git commit -m "fix: make root biome lint green

Root biome lint . scans paths the old per-package turbo lint never
reached. Excludes .agents skill templates, which are illustrative
samples rather than source, and fixes the real unused-variable and
explicit-any violations in scripts/install-registry.mjs."
```

</details>

---

### Task 3: Delete turbo.json and remaining manifest references

**Files:**
- Delete: `turbo.json`
- Modify: `packages/ui/package.json` (remove `@turbo/gen`)
- Modify: `packages/ui/tsconfig.lint.json:6`
- Modify: `.github/CODEOWNERS:26`

**Interfaces:**
- Consumes: Task 2's completed script migration (nothing may reference `turbo.json` any more).
- Produces: a repo with no Turbo config and no Turbo dependency.

- [ ] **Step 1: Confirm `@turbo/gen` is dead before deleting it**

Run: `ls packages/ui/turbo 2>&1; grep -rn "@turbo/gen\|turbo/generators\|plop" --exclude-dir=node_modules --exclude=bun.lock .`

Expected: `No such file or directory`, and the only grep hit is the `packages/ui/package.json` dependency line itself. This proves no generator templates exist.

- [ ] **Step 2: Delete turbo.json**

```bash
git rm turbo.json
```

- [ ] **Step 3: Remove `@turbo/gen`**

Delete this line from `devDependencies` in `packages/ui/package.json`:

```json
    "@turbo/gen": "^2.5.5",
```

- [ ] **Step 4: Remove the stale generators path from the lint tsconfig**

In `packages/ui/tsconfig.lint.json`, change line 6 from:

```json
  "include": ["src", "turbo"],
```

to:

```json
  "include": ["src"],
```

- [ ] **Step 5: Remove the CODEOWNERS entry**

Delete this line from `.github/CODEOWNERS`:

```
/turbo.json         @bromso
```

- [ ] **Step 6: Reinstall and verify**

Run: `bun install && bun run build`

Expected: install succeeds, build still passes with no `turbo.json` present.

- [ ] **Step 7: Commit**

```bash
git add -A turbo.json packages/ui/package.json packages/ui/tsconfig.lint.json .github/CODEOWNERS
git commit -m "chore: delete turbo.json and remove turbo dependencies

@turbo/gen was dead weight: no turbo/generators directory exists and
nothing referenced it. Also drops the stale turbo path from the ui lint
tsconfig and the turbo.json CODEOWNERS entry."
```

---

### Task 4: Replace `turbo prune` in the app and www Dockerfiles

`turbo prune --docker` has no Bun equivalent, but `bun install --filter <pkg>` installs only that package's subtree (verified: unrelated workspaces get no `node_modules`), which achieves the same lean image.

**Files:**
- Modify: `docker/app.Dockerfile`
- Modify: `docker/www.Dockerfile`
- Modify: `apps/www/next.config.ts` (add `output: "standalone"`)

**Interfaces:**
- Consumes: Task 2's `bun run --filter` scripts.
- Produces: Dockerfiles with no `pruner` stage. Task 5 applies the same de-Turbo treatment to `dev.Dockerfile`.

- [ ] **Step 1: Prove www's image is broken today**

Run: `grep -n "standalone" apps/www/next.config.ts; echo "exit=$?"`

Expected: no match. `docker/www.Dockerfile` copies `.next/standalone`, but Next only emits that directory when `output: "standalone"` is set — so this image cannot build. `apps/app/next.config.mjs:16` sets it correctly.

- [ ] **Step 2: Fix the www Next config**

In `apps/www/next.config.ts`, change:

```ts
const nextConfig: NextConfig = {
  // Empty turbopack config to allow Serwist webpack config alongside Turbopack
  turbopack: {},
```

to:

```ts
const nextConfig: NextConfig = {
  output: "standalone",
  // Empty turbopack config to allow Serwist webpack config alongside Turbopack
  turbopack: {},
```

Do not touch the `turbopack: {}` line — that is Next.js Turbopack, not Turborepo.

- [ ] **Step 3: Rewrite `docker/app.Dockerfile`**

Replace everything from the first line through the `RUN bun turbo build --filter=@repo/app` line with:

```dockerfile
# apps/app - Main Dashboard (port 3001)
FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS installer
# manifests only — this layer stays cached until a package.json or the lockfile changes
COPY package.json bun.lock ./
COPY apps/app/package.json                   ./apps/app/
COPY apps/www/package.json                   ./apps/www/
COPY apps/story/package.json                 ./apps/story/
COPY packages/ui/package.json                ./packages/ui/
COPY packages/tokens/package.json            ./packages/tokens/
COPY packages/typescript-config/package.json ./packages/typescript-config/
RUN bun install --frozen-lockfile --filter '@repo/app'

FROM installer AS builder
COPY . .
RUN bun run --filter '@repo/app' build
```

Leave the final `runner` stage exactly as it is, but change its two `COPY --from=installer` lines to `COPY --from=builder`, since the build output now lives in the `builder` stage:

```dockerfile
FROM oven/bun:1-slim AS runner
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 nextjs
ENV NODE_ENV=production PORT=3001 HOSTNAME="0.0.0.0"
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/.next/static ./apps/app/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/app/public ./apps/app/public
USER nextjs
EXPOSE 3001
CMD ["bun", "run", "apps/app/server.js"]
```

All seven manifests are copied even though only `@repo/app` is installed: the root `workspaces` globs and `bun.lock` describe the whole workspace set, so `--frozen-lockfile` fails if any manifest is missing. `--filter` still keeps the *installed* tree lean. The `apt-get install unzip` line from the old `base` stage is dropped — it existed only so `bun add -g turbo` could unpack the Turbo binary.

- [ ] **Step 4: Rewrite `docker/www.Dockerfile`**

Identical structure, substituting `@repo/www`, `apps/www`, and port 3000:

```dockerfile
# apps/www - Marketing Site (port 3000)
FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS installer
# manifests only — this layer stays cached until a package.json or the lockfile changes
COPY package.json bun.lock ./
COPY apps/app/package.json                   ./apps/app/
COPY apps/www/package.json                   ./apps/www/
COPY apps/story/package.json                 ./apps/story/
COPY packages/ui/package.json                ./packages/ui/
COPY packages/tokens/package.json            ./packages/tokens/
COPY packages/typescript-config/package.json ./packages/typescript-config/
RUN bun install --frozen-lockfile --filter '@repo/www'

FROM installer AS builder
COPY . .
RUN bun run --filter '@repo/www' build

FROM oven/bun:1-slim AS runner
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 nextjs
ENV NODE_ENV=production PORT=3000 HOSTNAME="0.0.0.0"
COPY --from=builder --chown=nextjs:nodejs /app/apps/www/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/www/.next/static ./apps/www/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/www/public ./apps/www/public
USER nextjs
EXPOSE 3000
CMD ["bun", "run", "apps/www/server.js"]
```

- [ ] **Step 5: Build both images**

Run:

```bash
docker build -f docker/app.Dockerfile -t boilerplate/app:test .
docker build -f docker/www.Dockerfile -t boilerplate/www:test .
```

Expected: both succeed. The www build is the real test of the `output: "standalone"` fix — before Step 2 it would fail at the `.next/standalone` COPY.

- [ ] **Step 6: Verify the app image actually runs**

Run: `docker run --rm -p 3001:3001 boilerplate/app:test`

Expected: the server starts and `http://localhost:3001` responds. Stop with Ctrl-C.

- [ ] **Step 7: Commit**

```bash
git add docker/app.Dockerfile docker/www.Dockerfile apps/www/next.config.ts
git commit -m "build: replace turbo prune with bun install --filter in Dockerfiles

bun install --filter installs only the target workspace subtree, giving
the same lean image turbo prune produced. Also adds the missing
output: standalone to apps/www, without which www.Dockerfile could not
build at all."
```

---

### Task 5: De-Turbo the dev Dockerfile

**Files:**
- Modify: `docker/dev.Dockerfile`

**Interfaces:**
- Consumes: nothing from Task 4.
- Produces: a `dev.Dockerfile` that builds — it cannot today.

- [ ] **Step 1: Prove it is broken today**

Run: `ls apps/docs apps/legal 2>&1`

Expected: `No such file or directory` for both. `dev.Dockerfile` has `COPY` lines for both apps' `package.json`, so `docker build` hard-fails on them regardless of Turbo.

- [ ] **Step 2: Remove the global turbo install**

Delete this line:

```dockerfile
RUN bun add -g turbo@2.5.5
```

- [ ] **Step 3: Drop turbo.json from the COPY line**

Change:

```dockerfile
COPY --chown=bun:bun package.json bun.lock turbo.json ./
```

to:

```dockerfile
COPY --chown=bun:bun package.json bun.lock ./
```

- [ ] **Step 4: Remove the COPY lines for apps that do not exist**

Delete these two lines:

```dockerfile
COPY --chown=bun:bun apps/docs/package.json ./apps/docs/
COPY --chown=bun:bun apps/legal/package.json ./apps/legal/
```

- [ ] **Step 5: Build it**

Run: `docker build -f docker/dev.Dockerfile -t boilerplate/dev:test .`

Expected: succeeds. This is the first time this image has built.

- [ ] **Step 6: Commit**

```bash
git add docker/dev.Dockerfile
git commit -m "fix: make dev.Dockerfile buildable and turbo-free

Removes the global turbo install and turbo.json copy, plus COPY lines
for apps/docs and apps/legal, which no longer exist and made every
docker build of this file fail."
```

---

### Task 6: Fix the doctor script

Two of `doctor`'s checks are Turbo-specific, and one of them is how it decides whether `bun install` ran at all.

**Files:**
- Modify: `scripts/doctor.ts:34-41` (the "Node modules installed" check)
- Modify: `scripts/doctor.ts:63-70` (the "Turbo config" check)

**Interfaces:**
- Consumes: Task 3's deletion of `turbo.json`.
- Produces: a `bun run doctor` that passes.

- [ ] **Step 1: Watch doctor fail**

Run: `bun run doctor`

Expected: the "Node modules installed" and "Turbo config" checks both FAIL, because `node_modules/turbo` and `turbo.json` were removed in Tasks 2 and 3.

- [ ] **Step 2: Repoint the install check at Biome**

In `scripts/doctor.ts`, replace this check:

```ts
  {
    name: "Node modules installed",
    check: async () => {
      const turboPackage = Bun.file("node_modules/turbo/package.json")
      const exists = await turboPackage.exists()
      return exists
        ? { ok: true, message: "Installed" }
        : { ok: false, message: "Run: bun install" }
    },
  },
```

with:

```ts
  {
    name: "Node modules installed",
    check: async () => {
      const biomePackage = Bun.file("node_modules/@biomejs/biome/package.json")
      const exists = await biomePackage.exists()
      return exists
        ? { ok: true, message: "Installed" }
        : { ok: false, message: "Run: bun install" }
    },
  },
```

`@biomejs/biome` is a root devDependency, so it is a reliable signal that a root install completed.

- [ ] **Step 3: Replace the Turbo config check with a workspaces check**

Replace this check:

```ts
  {
    name: "Turbo config",
    check: async () => {
      const turboConfig = Bun.file("turbo.json")
      const exists = await turboConfig.exists()
      return exists ? { ok: true, message: "Found" } : { ok: false, message: "Missing turbo.json" }
    },
  },
```

with:

```ts
  {
    name: "Bun workspaces",
    check: async () => {
      const rootPackage = Bun.file("package.json")
      if (!(await rootPackage.exists())) {
        return { ok: false, message: "Missing package.json" }
      }
      const { workspaces } = await rootPackage.json()
      return Array.isArray(workspaces) && workspaces.length > 0
        ? { ok: true, message: workspaces.join(", ") }
        : { ok: false, message: "Missing workspaces in package.json" }
    },
  },
```

- [ ] **Step 4: Watch doctor pass**

Run: `bun run doctor`

Expected: every check passes. The workspaces check prints `apps/*, packages/*`.

- [ ] **Step 5: Commit**

```bash
git add scripts/doctor.ts
git commit -m "fix: remove turbo checks from doctor script

The install check keyed off node_modules/turbo, so it reported a broken
environment once turbo was removed. It now checks for Biome, and the
turbo.json check is replaced by a Bun workspaces check."
```

---

### Task 7: Clean Turbo out of the CI workflow

The workflow is `.disabled` and stays that way — this only removes Turbo from it.

**Files:**
- Modify: `.github/workflows/ci.yml.disabled`

**Interfaces:**
- Consumes: Task 2's root scripts.
- Produces: a workflow with no Turbo cache steps or secrets.

- [ ] **Step 1: Count what must go**

Run: `grep -c -i turbo .github/workflows/ci.yml.disabled`

Expected: `18`. This must reach `0`.

- [ ] **Step 2: Delete the env block**

Remove these three lines near the top of the file:

```yaml
env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ secrets.TURBO_TEAM }}
```

- [ ] **Step 3: Delete all four "Cache Turbo" steps**

The file contains this block four times — once in each of the `build`, `test`, `storybook-test` and `e2e` jobs. Delete every occurrence:

```yaml
      - name: Cache Turbo
        uses: actions/cache@v4
        with:
          path: .turbo
          key: turbo-${{ runner.os }}-${{ github.sha }}
          restore-keys: |
            turbo-${{ runner.os }}-
```

Leave the "Cache Bun dependencies" steps in place.

- [ ] **Step 4: Verify**

Run: `grep -c -i turbo .github/workflows/ci.yml.disabled`

Expected: `0`.

- [ ] **Step 5: Confirm the file is still valid YAML**

Run: `bunx js-yaml .github/workflows/ci.yml.disabled > /dev/null && echo VALID`

Expected: `VALID`. (If `js-yaml` is unavailable, `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml.disabled'))" && echo VALID` works too.)

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml.disabled
git commit -m "ci: remove turbo remote cache config from workflow

Drops TURBO_TOKEN/TURBO_TEAM and the four Cache Turbo steps. The
workflow remains disabled."
```

---

### Task 8: Update editor and agent tooling config

**Files:**
- Modify: `.vscode/tasks.json` (six task labels + the `beginsPattern`)
- Modify: `.vscode/keybindings.reference.json` (the `args` that reference those labels)
- Modify: `.vscode/extensions.json:7`
- Modify: `.vscode/settings.json:26`
- Modify: `.devcontainer/devcontainer.json:16,78`
- Modify: `.claude/settings.json:12`

**Interfaces:**
- Consumes: Task 2's root script names.
- Produces: VS Code tasks renamed `turbo: *` → `mono: *`. The keybindings file references these labels by exact string and must stay in sync.

- [ ] **Step 1: Watch the labels and keybindings drift**

Run: `grep -n '"label": "turbo' .vscode/tasks.json; grep -n '"args": "turbo' .vscode/keybindings.reference.json`

Expected: six labels and six matching `args`. Every rename must be applied to both files or the keybindings silently stop resolving.

- [ ] **Step 2: Rename the task labels**

In `.vscode/tasks.json`, change the section comment and all six labels:

| Line | From | To |
|---|---|---|
| comment | `// ===== Turbo (monorepo-wide) =====` | `// ===== Monorepo-wide =====` |
| label | `"label": "turbo: dev"` | `"label": "mono: dev"` |
| label | `"label": "turbo: build"` | `"label": "mono: build"` |
| label | `"label": "turbo: lint"` | `"label": "mono: lint"` |
| label | `"label": "turbo: lint:fix"` | `"label": "mono: lint:fix"` |
| label | `"label": "turbo: typecheck"` | `"label": "mono: typecheck"` |
| label | `"label": "turbo: clean"` | `"label": "mono: clean"` |

The `command` values (`bun dev`, `bun run build`, `bun run lint`, `bun run lint:fix && bun run format:fix`, `bun run clean`) are already Bun scripts and stay as-is — except `mono: typecheck`, whose command is currently `bun run check` (Biome, not TypeScript). Change it to the real thing:

```json
      "command": "bun run typecheck",
```

- [ ] **Step 3: Fix the background matcher**

In the `mono: dev` task, the `beginsPattern` waits for Turbo's banner, which will never appear. Change:

```json
        "background": { "activeOnStart": true, "beginsPattern": "turbo", "endsPattern": "Ready in" }
```

to:

```json
        "background": { "activeOnStart": true, "beginsPattern": "dev", "endsPattern": "Ready in" }
```

- [ ] **Step 4: Update the keybindings reference**

In `.vscode/keybindings.reference.json`, update the comments and all six `args` to match the new labels: `"turbo: dev"` → `"mono: dev"`, `"turbo: build"` → `"mono: build"`, `"turbo: lint"` → `"mono: lint"`, `"turbo: lint:fix"` → `"mono: lint:fix"`, `"turbo: typecheck"` → `"mono: typecheck"`, `"turbo: clean"` → `"mono: clean"`. Also update the three descriptive comments that name Turbo, e.g. `// Ctrl+Shift+D: Run all apps (turbo dev)` → `// Ctrl+Shift+D: Run all apps (bun dev)`.

- [ ] **Step 5: Remove the Turbo VS Code extension and file association**

In `.vscode/extensions.json`, delete:

```json
    "Vercel.turbo-vsc",
```

In `.vscode/settings.json`, delete from the file-associations block:

```json
    "turbo.json": "jsonc",
```

In `.devcontainer/devcontainer.json`, delete both:

```json
        "Vercel.turbo-vsc",
```

```json
          "turbo.json": "jsonc",
```

- [ ] **Step 6: Remove the Claude permission**

In `.claude/settings.json`, delete:

```json
      "Bash(bun turbo:*)",
```

- [ ] **Step 7: Verify labels and args still match, and no turbo remains**

Run:

```bash
grep -n '"label": "mono' .vscode/tasks.json
grep -n '"args": "mono' .vscode/keybindings.reference.json
grep -ri turbo .vscode .devcontainer .claude/settings.json
```

Expected: six labels, six matching args, and **no** grep output from the third command.

- [ ] **Step 8: Confirm the JSON still parses**

Run: `for f in .vscode/tasks.json .vscode/settings.json .vscode/extensions.json .vscode/keybindings.reference.json .devcontainer/devcontainer.json .claude/settings.json; do bunx json5 "$f" > /dev/null && echo "OK $f"; done`

Expected: `OK` for each. These files contain comments, so a plain `JSON.parse` will reject them — use a JSON5/JSONC parser, or verify by opening them in VS Code without red squiggles.

- [ ] **Step 9: Commit**

```bash
git add .vscode .devcontainer .claude/settings.json
git commit -m "chore: rename vscode turbo tasks to mono and drop turbo tooling

Task labels turbo:* become mono:*, kept in sync with the keybindings
reference that targets them by exact label. mono: typecheck now runs the
real typecheck instead of biome check. Removes the Vercel.turbo-vsc
recommendation, turbo.json file associations, and the bun turbo
permission."
```

---

### Task 9: Update user-facing documentation

**Files:**
- Modify: `CLAUDE.md:9,36,162,164`
- Modify: `README.md:7,68`
- Modify: `LLMS.txt:3,25`
- Modify: `apps/www/src/views/home-view.tsx:9`

**Interfaces:**
- Consumes: Task 2's root script names.
- Produces: docs describing Bun workspaces. Task 10 does the same for `.claude/` agent tooling.

- [ ] **Step 1: See what still claims Turborepo**

Run: `grep -n -i turborepo CLAUDE.md README.md LLMS.txt apps/www/src/views/home-view.tsx`

Expected: matches in all four files.

- [ ] **Step 2: Update CLAUDE.md**

Line 9 — change the comment:

```
bun dev              # Start all apps in parallel via Bun workspaces
```

Line 36 — change the bullet:

```
- **Bun workspaces** + `bun run --filter` for build orchestration
```

Line 162 — change:

```
1. Check TypeScript errors: `bun run typecheck`
```

Line 164 — the "Clear cache" step referenced `.turbo`, which no longer exists:

```
3. Clear caches: `bun run clean && bun install`
```

- [ ] **Step 3: Update README.md**

Line 7 — replace the Turborepo badge with a Biome badge (keeps the badge row balanced):

```markdown
[![Biome](https://img.shields.io/badge/Biome-2.3-60a5fa?logo=biome)](https://biomejs.dev/)
```

Line 68 — change the stack table row:

```markdown
| **Monorepo** | Bun workspaces |
```

- [ ] **Step 4: Update LLMS.txt**

Line 3 — change the stack line:

```
STACK: Bun 1.3 workspaces | Next.js 15-16 | React 19 | TypeScript 5.7
```

Line 25 — change the command:

```
  bun run typecheck                    TypeScript check
```

Only these two lines. LLMS.txt has other stale content (`apps/legal`, `apps/docs`, Supabase, Fumadocs) that does not mention Turbo and is out of scope per the spec.

- [ ] **Step 5: Update the marketing copy**

In `apps/www/src/views/home-view.tsx` line 9, the site literally advertises Turborepo. Change:

```tsx
        description="Tokens, components, blocks, views, pages — wired up with Next.js, Bun, Turborepo, and Biome."
```

to:

```tsx
        description="Tokens, components, blocks, views, pages — wired up with Next.js, Bun workspaces, and Biome."
```

- [ ] **Step 6: Verify and rebuild www**

Run: `grep -n -i turborepo CLAUDE.md README.md LLMS.txt apps/www/src/views/home-view.tsx; bun run build:www`

Expected: no grep output, and the www build passes (it compiles the changed TSX).

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md README.md LLMS.txt apps/www/src/views/home-view.tsx
git commit -m "docs: describe bun workspaces instead of turborepo

Updates the contributor docs, README badge and stack table, LLM quick
reference, and the marketing copy on the www home view."
```

---

### Task 10: Update Claude commands, agents and skills

**Files:**
- Modify: `.claude/commands/dev.md`, `build.md`, `typecheck.md`, `clean.md`, `doctor.md`
- Modify: `.claude/agents/test-debugger.md:8,12,26,53,62,76`
- Modify: `.claude/agents/feature-builder.md:63`
- Modify: `.claude/skills/repo-conventions/SKILL.md:3`
- Modify: `.claude/skills/monorepo-deps/SKILL.md:3,8,15,60`
- Modify: `.claude/skills/repo-conventions/eval-results.json:3`, `.claude/skills/monorepo-deps/eval-results.json:3`, `.claude/skills/add-ui-component/eval-results.json:3`, `.claude/skills/add-ui-component/SKILL.md:3`

**Interfaces:**
- Consumes: Task 2's root script names.
- Produces: agent tooling that describes the real commands.

- [ ] **Step 1: List every remaining reference**

Run: `grep -rn -i turbo .claude/`

Expected: hits across commands, agents, skills, and the `eval-results.json` files.

- [ ] **Step 2: Update the slash commands**

`.claude/commands/dev.md` — change `- **No argument**: Start all apps in parallel via Turborepo` to `- **No argument**: Start all apps in parallel via Bun workspaces`.

`.claude/commands/build.md` — change `- **No argument**: Build all apps in parallel via Turborepo` to `- **No argument**: Build all apps in parallel via Bun workspaces`.

`.claude/commands/typecheck.md` — replace instruction steps 1 and 2 with:

```markdown
1. Run `bun run typecheck` to check types across all apps
2. To check a single app: `bun run --filter @repo/app typecheck`
```

`.claude/commands/clean.md` — delete the `- `.turbo` - Turborepo cache` bullet.

`.claude/commands/doctor.md` — change step 4 from `Verify Turbo is available: `bunx turbo --version`` to `Verify Bun workspaces are configured: `bun pm ls --all``.

- [ ] **Step 3: Update the agents**

In `.claude/agents/test-debugger.md`:
- Line 8: `Turborepo` → `Bun workspaces`
- Line 12: `- **Monorepo**: Turborepo with Bun workspaces` → `- **Monorepo**: Bun workspaces`
- Line 26: `bun turbo check-types` → `bun run typecheck`
- Line 53: `rm -rf .turbo && bun run build` → `bun run clean && bun install && bun run build`
- Line 62: `rm -rf .turbo .next node_modules` → `bun run clean`
- Line 76: `bun run lint:fix && bun turbo check-types` → `bun run lint:fix && bun run typecheck`

In `.claude/agents/feature-builder.md` line 63: `bun turbo check-types # TypeScript check` → `bun run typecheck     # TypeScript check`.

- [ ] **Step 4: Update the skills**

`.claude/skills/repo-conventions/SKILL.md` line 3 — in the `description:` frontmatter, change `a Bun + Turborepo monorepo` to `a Bun workspaces monorepo`.

`.claude/skills/monorepo-deps/SKILL.md`:
- Line 3: `description:` — change `Bun + Turborepo monorepo` to `Bun workspaces monorepo`
- Line 8: `Manage dependencies in this Bun-based Turborepo monorepo.` → `Manage dependencies in this Bun workspaces monorepo.`
- Line 15: `- **Build orchestration:** Turborepo` → `- **Build orchestration:** Bun workspaces (\`bun run --filter\`)`
- Line 60: ``2. `bun typecheck` (delegates to `turbo check-types`)`` → ``2. `bun run typecheck` (delegates to `bun run --filter @repo/app --filter @repo/www typecheck`)``
  **Corrected 2026-08-01.** This line originally mandated `--filter '*'`, written before the Task 1
  typecheck-scoping amendment and never propagated. Task 10's review caught the copied-through
  error. `--filter '*'` would pull in `@repo/story` and its 996 pre-existing type errors, which is
  not what the real root script does.

`.claude/skills/add-ui-component/SKILL.md` line 3 — change `Bun + Turborepo monorepo` to `Bun workspaces monorepo` in the `description:`.

- [ ] **Step 5: Resync the eval-results descriptions**

Each `.claude/skills/*/eval-results.json` embeds a copy of its skill's `description` at line 3. Update the `"description"` value in `repo-conventions/eval-results.json`, `monorepo-deps/eval-results.json` and `add-ui-component/eval-results.json` so each matches its `SKILL.md` frontmatter verbatim. If they drift, the skill descriptions and their eval records disagree.

- [ ] **Step 6: Verify**

Run: `grep -rn -i turbo .claude/`

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add .claude
git commit -m "docs: update claude commands, agents and skills for bun workspaces

Replaces turbo check-types with bun run typecheck, .turbo cache removal
with bun run clean, and resyncs the embedded skill descriptions in
eval-results.json."
```

---

### Task 11: Full verification sweep

**Files:** none modified unless a check fails.

**Interfaces:**
- Consumes: every prior task.
- Produces: evidence the migration is complete.

- [ ] **Step 1: Confirm turbo.json is gone**

Run: `ls turbo.json 2>&1`

Expected: `No such file or directory`.

- [ ] **Step 2: Confirm no active Turbo references remain**

Run:

```bash
grep -ri "turborepo\|turbo build\|turbo dev\|turbo start\|turbo lint\|turbo check-types\|turbo prune\|@turbo/gen\|bun turbo" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude=bun.lock --exclude-dir=docs .
```

Expected: no output.

The pattern deliberately omits the bare string `turbo.json`, because `.editorconfig:34` and `.claudeignore:50` legitimately keep referencing it and are on the leave-alone list. `--exclude-dir=docs` skips the design doc and this plan, which discuss Turbo by necessity.

- [ ] **Step 3: Clean install from scratch**

Run: `bun run clean && bun install`

Expected: both succeed.

- [ ] **Step 4: Confirm turbo is not installed**

Run: `ls node_modules/turbo 2>&1`

Expected: `No such file or directory`.

- [ ] **Step 5: Run the full validation chain**

Run: `bun run typecheck && bun run build`

Expected: both pass. In the build output, confirm `@repo/tokens` completes before `@repo/story` begins.

**`lint` and `check` are expected to FAIL**, and that is not a migration defect — see the Task 2b
correction note. Verify only that they fail for the *known pre-existing* reasons and nothing new:

Run: `bunx biome lint . --max-diagnostics=none 2>&1 | grep -E "^Found"`

Expected: `Found 70 errors.` / `Found 415 warnings.` (or fewer). If the error count is **higher than
70**, this migration introduced new lint failures — investigate before proceeding. Always pass
`--max-diagnostics=none`; Biome's default cap of 20 silently truncates the count and will mislead
you.

Then confirm the `@repo/story` debt is still reachable rather than deleted:

Run: `bun run --filter @repo/story typecheck; echo "exit=$?"`

Expected: a non-zero exit with the pre-existing errors. This must still be *runnable* — the debt is scoped out of the root script, not removed.

- [ ] **Step 6: Run doctor**

Run: `bun run doctor`

Expected: the two migrated checks pass — `Node modules installed: Installed` and
`Bun workspaces: apps/*, packages/*`.

The `apps/app/.env.local` check may fail depending on the machine. That file is gitignored and
machine-local, so its absence is unrelated to this migration. Do not create it, and do not weaken
that check, just to make doctor exit 0.

- [ ] **Step 7: Verify dev**

Run: `bun run dev`

Expected: `http://app.localhost:3001`, `http://www.localhost:3000` and `http://localhost:6006` all respond. Stop with Ctrl-C.

- [ ] **Step 8: Verify all three Docker images build**

Run:

```bash
docker build -f docker/app.Dockerfile -t boilerplate/app:verify .
docker build -f docker/www.Dockerfile -t boilerplate/www:verify .
docker build -f docker/dev.Dockerfile -t boilerplate/dev:verify .
```

Expected: all three succeed.

- [ ] **Step 9: Add a changeset**

This changes the developer-facing build commands, so it is user-visible for a boilerplate.

Run: `bun changeset`

Choose a **minor** bump, with a summary like: `Replace Turborepo with Bun workspaces for task orchestration. Root scripts now use bun run --filter; bun turbo check-types becomes bun run typecheck.`

- [ ] **Step 10: Commit**

```bash
git add .changeset
git commit -m "chore: add changeset for turborepo removal"
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Root script surface (all 13 rows) | 2 |
| Root-level lint/format, fan-out typecheck | 1, 2 |
| `check-types` was broken | 1 |
| Docker: `turbo prune` → `bun install --filter` | 4 |
| Docker: `unzip` removal, pruner stage removal | 4 |
| Pre-existing fix — dead docs/legal COPY lines | 5 |
| Pre-existing fix — www `output: "standalone"` | 4 |
| Deleted: `turbo.json`, `turbo` dep, `keywords`, `@turbo/gen`, `tsconfig.lint.json`, CODEOWNERS | 2, 3 |
| Rewritten: `doctor.ts` | 6 |
| Rewritten: CI workflow | 7 |
| Rewritten: `.vscode/*`, `.devcontainer`, `.claude/settings.json` | 8 |
| Rewritten: `CLAUDE.md`, `README.md`, `LLMS.txt`, `home-view.tsx` | 9 |
| Rewritten: `.claude/` commands, agents, skills, eval-results | 10 |
| Version pin bump to `bun@1.3.14` | 2 |
| Verification checklist (all 11 items) | 11 |

No gaps.

**Placeholder scan:** No TBD/TODO, no "similar to Task N", no "handle edge cases". Every code step shows the literal before/after content.

**Type consistency:** The only new TypeScript is in Task 6, which conforms to the existing `Check` interface at `scripts/doctor.ts:12-15` (`name: string`, `check: () => Promise<CheckResult>`) and returns `{ ok, message }` matching `CheckResult`. Script names are consistent across tasks: `typecheck` (defined Task 1, used in Tasks 2, 8, 9, 10, 11), `clean` (defined Task 2, used in Tasks 9, 10, 11). VS Code task labels renamed in Task 8 Step 2 are the exact strings referenced in Step 4.

**One risk worth restating:** Task 1 Step 4 can fail on pre-existing type errors that `turbo check-types` was hiding. The step instructs the implementer to stop and escalate rather than absorb unplanned work.
