# Repo Hygiene & CI Enablement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four failing Dependabot jobs, enable a CI workflow that runs only checks which actually pass, and delete the broken deployment layer and dead code left behind when this boilerplate was slimmed down.

**Architecture:** Every problem shares one cause — apps `docs`, `legal`, `web` and package `utils` were removed, and config still points at them. Work proceeds in dependency order: make Storybook green before CI runs it, delete the k8s layer before cleaning up what referenced it.

**Tech Stack:** GitHub Actions, Dependabot, Bun 1.3.14 workspaces, Storybook 10 + `@storybook/addon-vitest`, Docker, devcontainers.

**Spec:** `docs/plans/2026-08-01-repo-hygiene-ci-green-design.md`

## Global Constraints

- **Branch:** create `chore/repo-hygiene-ci-green` **off `chore/turborepo-to-bun-workspaces`**, not off `main`. The `ci.yml` being enabled is the de-turbo'd one from PR #1, which is not yet merged. PR #2 will not be mergeable until PR #1 lands.
- Repo style: double quotes, no semicolons, 2-space indent, 100 char line width. Commits run commitlint (Conventional Commits) and lint-staged via husky.
- **`bun run lint` and `bun run check` FAIL** with 70 errors / 415 warnings — pre-existing debt in vendored `packages/ui` components. Never use them as a success gate, and never fix or suppress what they report.
- **`bun run --filter @repo/story typecheck` FAILS** with 996 pre-existing type errors. Out of scope. Never fix or suppress.
- When counting Biome diagnostics, always pass `--max-diagnostics=none`. The default cap of 20 silently truncates the count.
- Do **not** touch `docker/app.Dockerfile`, `docker/www.Dockerfile` or `docker/dev.Dockerfile` — all three were rebuilt and verified in the previous migration.
- Do **not** edit `apps/app/CHANGELOG.md` or `apps/www/CHANGELOG.md`. They mention the Makefile and k8s but are historical release records.
- Do **not** re-enable `auto-merge-dependabot.yml.disabled`, `contributors.yml.disabled`, `docker-build.yml.disabled` or `release.yml.disabled`.
- `helm`, `k3d` and `kubectl` are **not installed** on this machine. Nothing k8s-related can be verified locally — which is why it is being deleted rather than fixed.

## Testing note for this plan

This is a configuration and cleanup project. The TDD cycle is: **write the verification command, run it to watch it fail, make the change, run it again to watch it pass.** The commands are the tests. Task 9 is the final sweep.

---

### Task 1: Fix the Dependabot config

This is the reported failure. Three of five `npm` entries point at directories that do not exist.

**Files:**
- Modify: `.github/dependabot.yml`

**Interfaces:**
- Consumes: nothing.
- Produces: a single root `npm` entry plus the existing `github-actions` entry. Task 3 makes the latter functional by landing a real workflow file.

- [ ] **Step 1: Confirm the three directories really are absent**

Run: `ls apps/web apps/docs packages/utils 2>&1`

Expected: `No such file or directory` for all three. This is the cause of
`/apps/docs/package.json not found` in the Dependabot logs.

- [ ] **Step 2: Replace the whole file**

Write `.github/dependabot.yml` as exactly:

```yaml
version: 2
updates:
  # Single root entry. Dependabot's npm ecosystem is workspace-aware, so this
  # covers apps/* and packages/* — and it matches reality, since there is one
  # bun.lock at the repo root rather than a lockfile per workspace.
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "daily"
    allow:
      - dependency-type: "all"
    open-pull-requests-limit: 10
    versioning-strategy: "auto"
    commit-message:
      prefix: "chore"
      include: "scope"
    labels:
      - "dependencies"
    ignore:
      - dependency-name: "*"
        update-types: ["version-update:semver-major", "version-update:semver-minor"]

  # GitHub Actions
  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
    commit-message:
      prefix: "chore"
      include: "scope"
    labels:
      - "dependencies"
      - "github-actions"
```

This removes the `/apps/web`, `/apps/docs` and `/packages/utils` entries, and folds the
`/packages/ui` entry into the root one. The `ignore` rules are preserved verbatim, so updates stay
patch-only.

- [ ] **Step 3: Verify no dead directory remains referenced**

Run: `grep -nE "apps/web|apps/docs|packages/utils" .github/dependabot.yml; echo "exit=$?"`

Expected: no output, `exit=1`.

- [ ] **Step 4: Verify the YAML parses**

Run: `bunx js-yaml .github/dependabot.yml > /dev/null && echo VALID`

Expected: `VALID`. If `js-yaml` cannot be fetched, use
`python3 -c "import yaml;yaml.safe_load(open('.github/dependabot.yml'))" && echo VALID`.

- [ ] **Step 5: Commit**

```bash
git add .github/dependabot.yml
git commit -m "fix: point dependabot at directories that exist

Three of five npm entries targeted /apps/web, /apps/docs and
/packages/utils, none of which exist, so those jobs failed every run with
'package.json not found'. Replaced with a single workspace-aware root
entry, which also covers the five workspaces that had no entry at all."
```

---

### Task 2: Fix the two component bugs failing the Storybook suite

> **Corrected 2026-08-01 during execution.** This task originally claimed all 7 failures came from
> two stories needing absent `.glb` 3D assets, and prescribed tagging them `!test`. That diagnosis
> was wrong. Vitest reports `Tests 7 failed` and `Errors 3 errors` as separate lines; the `.glb`
> 404s are the 3 *unhandled errors*, and `FluidGlass`/`ModelViewer` actually pass. The 7 real test
> failures are two genuine runtime crashes in shipped `packages/ui` components. Tagging the wrong
> stories removed 4 passing tests and left all 7 failures intact.

The suite is 1233/1240 passing. The 7 failures are two `ReferenceError` crashes that affect any
consumer of these components, not just tests.

**Files:**
- Modify: `packages/ui/src/components/particles.tsx`
- Modify: `packages/ui/src/components/CardSwap.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: an exit-0 `bun --filter @repo/story test --run`, which Task 3's `storybook` CI job depends on.

- [ ] **Step 1: Reproduce and confirm the two failures**

Run: `bun --filter @repo/story test --run 2>&1 | grep -E "ReferenceError|Test Files|Tests " | head -20`

Expected: `Cannot access 'animate' before initialization` from `Particles.stories.tsx` (5 tests) and
`front is not defined` from `CardSwap.stories.tsx` (2 tests), plus `Tests 7 failed | 1233 passed`.

The run takes about 150 seconds. Do not kill it early.

- [ ] **Step 2: Fix the temporal dead zone in particles.tsx**

`animate` is declared at line 243 as `const animate = () => { … }`, but it is referenced at line 103
(called inside a `useEffect`) and at line 125 (in that effect's dependency array). `const` bindings
have a temporal dead zone, so reading `animate` at line 125 throws
`ReferenceError: Cannot access 'animate' before initialization`.

Fix by making `animate` exist before the effect that depends on it. Wrap it in `useCallback` and
move the declaration above the `useEffect` at lines ~100-125:

```tsx
const animate = useCallback(() => {
  // ...existing body from the current line-243 declaration, unchanged...
}, [/* the values its body actually reads */])
```

Then delete the old `const animate = () => { … }` at line 243.

Requirements for this fix:
- The function body must be carried over **unchanged**. This is an ordering fix, not a rewrite.
- `useCallback` must be imported from `react` if it is not already.
- The dependency array must list what the body genuinely reads. Do not pass `[]` to silence things.
- The existing `useEffect` dependency array `[animate, initCanvas]` stays as-is — it becomes valid
  once `animate` is declared above it.

- [ ] **Step 3: Fix the out-of-scope reference in CardSwap.tsx**

At line 124, inside a callback, the code destructures `const [front, ...rest] = order.current`. At
line 215 — the dependency array of an outer `useEffect` — it references `refs[front].current`, where
`front` does not exist in that scope, throwing `ReferenceError: front is not defined`.

Delete this single line from that dependency array:

```tsx
    refs[front].current,
```

`order.current` is a ref, so its contents are not reactive and never belonged in a dependency array.
Leave every other entry in that array untouched.

- [ ] **Step 4: Verify the suite is green**

Run: `bun --filter @repo/story test --run 2>&1 | tail -8`

Expected: exit 0, `Test Files 305 passed (305)`, `Tests 1240 passed (1240)`.

The 3 unhandled `.glb` 404 `Errors` from `FluidGlass`/`ModelViewer` may still appear. They do not
fail tests. Leave them — do NOT tag those stories, and do NOT commit any `.glb` asset.

If the suite still shows failures, report exactly which, and do not paper over them.

- [ ] **Step 5: Verify the components still typecheck**

Run: `bun run typecheck && echo "TYPECHECK OK"`

Expected: `TYPECHECK OK`. This covers `apps/app` and `apps/www`, which consume `@repo/ui`.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/particles.tsx packages/ui/src/components/CardSwap.tsx
git commit -m "fix: repair two runtime crashes in ui components

particles.tsx referenced `animate` in a useEffect dependency array at
line 125 while declaring it at line 243, so the const's temporal dead
zone threw 'Cannot access animate before initialization' on every render.
Moved into a useCallback above its consumer.

CardSwap.tsx listed refs[front].current in an outer dependency array,
but `front` is destructured inside a callback and does not exist at that
scope, throwing 'front is not defined'. Removed the entry; order.current
is a ref and was never reactive.

Both crashed for any consumer, not just in tests. Takes the Storybook
suite from 1233/1240 to fully green."
```

---

### Task 3: Enable a trimmed CI workflow

**Files:**
- Create: `.github/workflows/ci.yml`
- Delete: `.github/workflows/ci.yml.disabled`

**Interfaces:**
- Consumes: Task 2's green Storybook suite.
- Produces: the first real workflow `.yml` in the repo, which is what makes Task 1's `github-actions` Dependabot entry able to run at all.

- [ ] **Step 1: Prove why the github-actions Dependabot job fails**

Run: `ls .github/workflows/*.yml 2>&1`

Expected: `No such file or directory`. Every workflow is named `*.yml.disabled`, so Dependabot's
github-actions ecosystem reports `/action.yml or /.github/workflows/<anything>.yml not found`.

- [ ] **Step 2: Confirm what passes and what does not**

Run each and note the result:

```bash
bun run typecheck; echo "typecheck=$?"
bun run build;     echo "build=$?"
bun test;          echo "bun_test=$?"
ls playwright.config.* apps/*/playwright.config.* 2>&1
```

Expected: `typecheck=0`, `build=0`, `bun test` reports **0 test files matched**, and no Playwright
config exists anywhere. These are the reasons the `test` and `e2e` jobs are being dropped rather
than carried over.

- [ ] **Step 3: Create the new workflow**

Create `.github/workflows/ci.yml` with exactly:

```yaml
name: CI

on: [push, pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Cache Bun dependencies
        uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}
          restore-keys: |
            bun-${{ runner.os }}-

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Typecheck
        run: bun run typecheck

      - name: Build
        run: bun run build

  storybook:
    runs-on: ubuntu-latest
    needs: verify
    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Cache Bun dependencies
        uses: actions/cache@v4
        with:
          path: ~/.bun/install/cache
          key: bun-${{ runner.os }}-${{ hashFiles('bun.lock') }}
          restore-keys: |
            bun-${{ runner.os }}-

      - name: Install dependencies
        run: bun install --frozen-lockfile

      - name: Install Playwright browsers
        run: bunx playwright install --with-deps chromium

      - name: Run Storybook tests
        run: bun --filter @repo/story test --run
```

Three deliberate changes from the disabled version:

1. The cache key hashes `bun.lock`, not `bun.lockb`. The old key hashed a file that does not exist,
   so the cache never hit.
2. `typecheck` is **added**. It was absent because `turbo check-types` referenced a script no
   package defined.
3. `lint`, the `test` job and the `e2e` job are **gone** — 70 pre-existing errors, zero test files,
   and no Playwright config respectively.

- [ ] **Step 4: Delete the disabled version**

```bash
git rm .github/workflows/ci.yml.disabled
```

- [ ] **Step 5: Verify the workflow is valid and complete**

Run:

```bash
bunx js-yaml .github/workflows/ci.yml > /dev/null && echo VALID
grep -c "bun.lockb" .github/workflows/ci.yml
grep -E "bun run lint|bun test|playwright test" .github/workflows/ci.yml
```

Expected: `VALID`, then `0`, then no output from the third command.

- [ ] **Step 6: Confirm Dependabot now has something to scan**

Run: `ls .github/workflows/*.yml`

Expected: `.github/workflows/ci.yml`.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: enable a workflow that runs only checks which pass

Adds typecheck, which never ran before because turbo check-types pointed
at a nonexistent script. Drops lint (70 pre-existing errors), the test
job (bun test matches 0 files) and the e2e job (no playwright config
exists) — both were passing by testing nothing. Fixes the cache key,
which hashed bun.lockb rather than bun.lock and so never hit.

Landing a real .yml also unblocks dependabot's github-actions ecosystem,
which was failing because every workflow was renamed .disabled."
```

---

### Task 4: Delete the dead k8s and Makefile layer

**Files:**
- Delete: `k8s/` (entire directory)
- Delete: `Makefile`
- Delete: `.github/workflows/deploy-k8s.yml.disabled`

**Interfaces:**
- Consumes: nothing.
- Produces: removal of paths that Task 5 cleans up references to.

- [ ] **Step 1: Document why it cannot work**

Run:

```bash
grep -n "charts/" Makefile
ls k8s/charts/
grep -n "^name:" k8s/charts/brand-monitor/Chart.yaml
ls k8s/charts/brand-monitor/charts/
```

Expected: the Makefile cds to `k8s/charts/kitchensink-react`; the directory is actually
`brand-monitor`; `Chart.yaml` names it `kitchensink-react`; and the subcharts are `app`, `docs`,
`www`, `legal` — two for apps that no longer exist. Every `make helm-*` target fails on the missing
path. Record this output in the commit message.

- [ ] **Step 2: Confirm the tooling is absent**

Run: `command -v helm kubectl k3d; echo "exit=$?"`

Expected: no output, non-zero exit. None of the three is installed, so no fix here could be
verified locally.

- [ ] **Step 3: Delete**

```bash
git rm -r k8s
git rm Makefile
git rm .github/workflows/deploy-k8s.yml.disabled
```

- [ ] **Step 4: Verify they are gone**

Run: `ls k8s Makefile .github/workflows/deploy-k8s.yml.disabled 2>&1`

Expected: `No such file or directory` for all three.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete the broken k8s and Makefile layer

Every make helm-* target cd'd into k8s/charts/kitchensink-react, a path
that does not exist — the directory is k8s/charts/brand-monitor. The
chart carried docs and legal subcharts for apps that were deleted, plus
their ingress paths in all four values files. make docker-build
referenced docs and legal Dockerfiles that do not exist either.

helm, kubectl and k3d are not installed, so none of this could be
verified even after repair. deploy-k8s.yml.disabled goes with it, since
it cd's into the same missing path."
```

---

### Task 5: Clean up references to the deleted layer

**Files:**
- Modify: `.vscode/tasks.json` (remove 11 `make` tasks)
- Modify: `.vscode/settings.json:27,28,78,88,89,106,107`
- Modify: `.editorconfig` (Makefile and k8s sections)
- Modify: `.claudeignore:96,97,100`
- Modify: `workspace.code-workspace` (Kubernetes, Docs, Legal folders)

**Interfaces:**
- Consumes: Task 4's deletions.
- Produces: an editor config with no orphaned task or path.

- [ ] **Step 1: Find every orphaned reference**

Run:

```bash
grep -n "make k3d\|make k8s\|make helm" .vscode/tasks.json
grep -n "helm\|k8s\|Makefile\|Chart.yaml" .vscode/settings.json
grep -n "Makefile\|k8s" .editorconfig
grep -n "k8s/\|apps/docs\|apps/legal" .claudeignore
grep -n "Kubernetes\|Docs\|Legal" workspace.code-workspace
```

Expected: 11 task hits, 7 settings hits, the `[Makefile]`/`[*.mk]`/`[k8s/**]` sections, three
`.claudeignore` lines, and three workspace folder entries.

- [ ] **Step 2: Remove the make tasks**

In `.vscode/tasks.json`, delete these eleven task objects entirely, along with the
`// ===== Kubernetes =====` section comment: `k8s: setup`, `k8s: create cluster`,
`k8s: delete cluster`, `k8s: build images`, `k8s: deploy`, `k8s: undeploy`, `k8s: status`,
`k8s: logs`, `k8s: port-forward`, `helm: lint`, `helm: template`.

Keep every `mono: *` task, both `docker: *` tasks, the `// ===== Docker =====` and
`// ===== Utilities =====` comments, the `shadcn: add` task, and the `inputs` array.

- [ ] **Step 3: Remove the k8s and Makefile settings**

In `.vscode/settings.json`, delete these lines:

```json
    "**/k8s/charts/**/*.yaml": "helm",
    "**/k8s/charts/**/*.tpl": "helm",
```

```json
  "[helm]": { "editor.defaultFormatter": "redhat.vscode-yaml" },
```

```json
    "kubernetes": ["k8s/**/*.yaml", "!k8s/charts/**"],
    "https://json.schemastore.org/chart.json": ["k8s/charts/**/Chart.yaml"],
```

```json
    "Chart.yaml": "Chart.lock, values.yaml, values-*.yaml, .helmignore",
    "Makefile": "*.mk",
```

Take care with trailing commas — the surrounding JSON must stay valid. These are JSONC files with
comments, so validate with a JSON5-aware parser, not `JSON.parse`.

- [ ] **Step 4: Remove the editorconfig sections**

In `.editorconfig`, delete both blocks including their banner comments:

```ini
# =============================================================================
# Makefiles (require tabs)
# =============================================================================
[Makefile]
indent_style = tab

[*.mk]
indent_style = tab
```

```ini
# =============================================================================
# Kubernetes / Helm
# =============================================================================
[k8s/**/*.yaml]
indent_size = 2

[k8s/charts/**/*.tpl]
indent_size = 2
```

- [ ] **Step 5: Clean the claudeignore**

In `.claudeignore`, delete these three lines:

```
apps/docs/.source/
apps/legal/.source/
```

```
k8s/
```

- [ ] **Step 6: Remove the dead workspace folders**

In `workspace.code-workspace`, delete these three entries from `folders`:

```json
    { "name": "☸️ Kubernetes", "path": "./k8s" },
```

```json
    { "name": "📜 Docs", "path": "./apps/docs" },
    { "name": "⚖️ Legal", "path": "./apps/legal" },
```

- [ ] **Step 7: Verify**

Run:

```bash
grep -rn "make k3d\|make k8s\|make helm\|k8s/\|Makefile" .vscode .editorconfig .claudeignore workspace.code-workspace 2>&1
for f in .vscode/tasks.json .vscode/settings.json workspace.code-workspace; do bunx json5 "$f" > /dev/null && echo "OK $f"; done
```

Expected: no output from the grep, then `OK` for each of the three files.

- [ ] **Step 8: Commit**

```bash
git add .vscode .editorconfig .claudeignore workspace.code-workspace
git commit -m "chore: drop editor config for the deleted k8s layer

Removes 11 VS Code tasks invoking a Makefile that no longer exists, the
helm and kubernetes schema associations, the Makefile and k8s
editorconfig sections, and the k8s plus apps/docs and apps/legal entries
in .claudeignore and the workspace file."
```

---

### Task 6: Fix docker-compose and the devcontainer

Both are broken right now, and both are worth keeping.

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.dev.yml:11,12,19,20`
- Modify: `.devcontainer/devcontainer.json:155`

**Interfaces:**
- Consumes: nothing from Tasks 4-5.
- Produces: a parsing `docker compose config` and a devcontainer whose `postCreateCommand` runs.

- [ ] **Step 1: Prove compose is broken**

Run: `docker compose config > /dev/null; echo "exit=$?"; ls docker/docs.Dockerfile 2>&1`

Expected: non-zero exit or an error naming `docker/docs.Dockerfile`, and `No such file or
directory`. The `docs` service builds a Dockerfile that does not exist.

- [ ] **Step 2: Remove the docs service and unused network**

In `docker-compose.yml`, delete this whole service block:

```yaml
  docs:
    build:
      context: .
      dockerfile: docker/docs.Dockerfile
    ports:
      - "3003:3003"
    restart: unless-stopped
    networks:
      - frontend
```

And in the `networks` block at the bottom, delete the unused `backend` network so it reads:

```yaml
networks:
  frontend:
    driver: bridge
```

No service references `backend`.

- [ ] **Step 3: Fix the dev compose mounts and ports**

In `docker-compose.dev.yml`, delete these two volume lines:

```yaml
      - /app/apps/docs/node_modules
      - /app/apps/legal/node_modules
```

and these two port mappings, which served the deleted apps:

```yaml
      - "3002:3002"
      - "3003:3003"
```

Leave the commented-out `postgres`/`redis` blocks alone — they are deliberate future scaffolding,
not dead config.

- [ ] **Step 4: Fix the devcontainer postCreateCommand**

In `.devcontainer/devcontainer.json` line 155, change:

```json
  "postCreateCommand": "cd packages/tokens && bun run build && cd ../../apps/docs && bun run postinstall && cd ../legal && bun run postinstall",
```

to:

```json
  "postCreateCommand": "cd packages/tokens && bun run build",
```

`apps/docs` and `apps/legal` are gone, so the `cd` fails and container creation aborts. No remaining
workspace defines a `postinstall` script, so there is nothing to carry over. `packages/tokens` does
define `build` (`node sd.config.js`), so that step is real and stays. Leave `postStartCommand` on
line 156 untouched.

- [ ] **Step 5: Verify compose parses and lists the right services**

Run: `docker compose config --services; docker compose -f docker-compose.dev.yml config --services`

Expected: `app` and `www` from the first (no `docs`), and `dev` from the second. Both exit 0.

- [ ] **Step 6: Verify the devcontainer builds**

Run: `docker build -f docker/dev.Dockerfile -t hygiene/dev:check .`

Expected: succeeds. Allow a generous timeout — Docker builds here take several minutes.

Then confirm the new `postCreateCommand` actually works inside it:

```bash
docker run --rm -v "$PWD":/app -w /app hygiene/dev:check sh -c "cd packages/tokens && bun run build && echo POSTCREATE_OK"
```

Expected: `POSTCREATE_OK`.

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml docker-compose.dev.yml .devcontainer/devcontainer.json
git commit -m "fix: repair compose and devcontainer for the current workspaces

docker compose up failed because the docs service built
docker/docs.Dockerfile, which does not exist. Devcontainer creation
failed because postCreateCommand cd'd into apps/docs and apps/legal. Also
drops the unused backend network and the 3002/3003 port mappings for the
deleted apps."
```

---

### Task 7: Delete dead code

**Files:**
- Delete: `scripts/generate-pwa-icons.ts`
- Delete: `packages/ui/tsconfig.lint.json`
- Delete: `.agents/skills/apollo-client/`
- Delete: `.agents/skills/better-auth-best-practices/`
- Delete: `.agents/skills/graphql-operations/`
- Delete: `.agents/skills/graphql-schema/`
- Delete: `.agents/skills/postgres-drizzle/`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing later tasks depend on.

- [ ] **Step 1: Prove each target is unreferenced**

Run:

```bash
grep -rn "generate-pwa-icons" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs .
grep -rn "tsconfig.lint" --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs .
grep -o '"\(@apollo/client\|graphql\|drizzle-orm\|better-auth\|@supabase/[a-z-]*\)"' package.json apps/*/package.json packages/*/package.json
```

Expected: the first two return only the files themselves (or nothing), and the third returns
**nothing** — no workspace depends on Apollo, GraphQL, Drizzle, Better Auth or Supabase.

If `grep -rn "tsconfig.lint"` shows a real consumer, **stop and report it** rather than deleting.

- [ ] **Step 2: Delete the dead scripts and config**

```bash
git rm scripts/generate-pwa-icons.ts
git rm packages/ui/tsconfig.lint.json
```

- [ ] **Step 3: Delete the five stale agent skills**

```bash
git rm -r .agents/skills/apollo-client
git rm -r .agents/skills/better-auth-best-practices
git rm -r .agents/skills/graphql-operations
git rm -r .agents/skills/graphql-schema
git rm -r .agents/skills/postgres-drizzle
```

These document a stack this repo does not have. `CLAUDE.md` states backend, data layer and auth are
intentionally deferred.

- [ ] **Step 4: Verify the right six skills survive**

Run: `ls .agents/skills/`

Expected exactly: `fixing-motion-performance`, `react-hook-form-zod`, `shadcn`, `skill-creator`,
`vercel-composition-patterns`, `vercel-react-best-practices`.

- [ ] **Step 5: Verify nothing broke**

Run: `bun run typecheck && bun run build && echo "STILL GREEN"`

Expected: `STILL GREEN`. In particular this confirms deleting `packages/ui/tsconfig.lint.json` broke
no build path.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove dead scripts and stale agent skills

generate-pwa-icons.ts and packages/ui/tsconfig.lint.json are referenced
by nothing. Five .agents skills documented Apollo, GraphQL, Drizzle and
Better Auth — a grep across every workspace package.json finds none of
those dependencies, and CLAUDE.md states backend, data and auth are
deliberately deferred. Skills describing a nonexistent stack actively
mislead agents."
```

---

### Task 8: Purge stale workspace references

**Files:**
- Modify: `LLMS.txt:10,11,59,60`
- Modify: `README.md:123,125,126`
- Modify: `CONTRIBUTING.md:149`
- Modify: `CLAUDE.md:44`
- Modify: `.claude/agents/component-architect.md:23,24`
- Rewrite: `.claude/agents/docs-writer.md`
- Modify: `.claude/commands/dev.md:10,11,25-29`
- Modify: `.github/CODEOWNERS:10,11`
- Modify: `.github/ISSUE_TEMPLATE/bug_report.yml:19,20`
- Modify: `.github/ISSUE_TEMPLATE/feature_request.yml:19,20`
- Modify: `.github/ISSUE_TEMPLATE/documentation.yml:31,32,45`

**Interfaces:**
- Consumes: nothing.
- Produces: a repo where the grep in Task 9 Step 2 returns nothing.

- [ ] **Step 1: List every remaining reference**

Run:

```bash
grep -rn "apps/docs\|apps/legal\|apps/web\|packages/utils\|@repo/docs\|@repo/legal\|@repo/utils" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude=bun.lock \
  --exclude-dir=docs --exclude=CHANGELOG.md .
```

Expected: hits in the files listed above. This is your worklist.

- [ ] **Step 2: Fix LLMS.txt**

Delete lines 10-11 entirely — they list apps that do not exist:

```
  apps/legal:3002 - Legal docs (public)
  apps/docs:3003  - Product docs (public)
```

Replace lines 59-60:

```
    -> Product docs? -> apps/docs/content/docs/
    -> Legal docs? -> apps/legal/content/docs/
```

with:

```
    -> Contributor docs? -> CLAUDE.md / CONTRIBUTING.md
    -> Component docs? -> apps/story/stories/
```

- [ ] **Step 3: Fix README.md**

Replace lines 123-126:

```markdown
For detailed documentation, visit the [docs site](http://localhost:3003) when running locally, or see:

- [Getting Started](./apps/docs/content/docs/getting-started/)
- [Architecture](./apps/docs/content/docs/architecture/)
```

with:

```markdown
For detailed documentation, see:

- [Architecture & conventions](./CLAUDE.md)
- [Component library](./apps/story/) — run `bun run story` and open http://localhost:6006
```

Keep the `- [Contributing](./CONTRIBUTING.md)` line that follows.

- [ ] **Step 4: Fix CONTRIBUTING.md**

Replace line 149:

```markdown
- **Documentation**: Run `bun --filter @repo/docs dev` and visit http://localhost:3003
```

with:

```markdown
- **Component docs**: Run `bun run story` and visit http://localhost:6006
```

- [ ] **Step 5: Fix CLAUDE.md**

Replace line 44:

```markdown
> Future subdomain apps follow the same pattern: `apps/auth` (auth.brand.com), `apps/docs` (docs.brand.com), etc.
```

with:

```markdown
> Future subdomain apps follow the same pattern: `apps/auth` (auth.brand.com), `apps/blog` (blog.brand.com), etc.
```

The literal string `apps/docs` must not survive, or Task 9's verification grep fails.

- [ ] **Step 6: Fix component-architect.md**

In `.claude/agents/component-architect.md`, delete lines 23-24:

```markdown
- `apps/legal` - Legal docs (:3002)
- `apps/docs` - Product docs (:3003)
```

Leave the surrounding `apps/app` and `apps/www` entries.

- [ ] **Step 7: Rewrite docs-writer.md**

`.claude/agents/docs-writer.md` (100 lines) is largely about two Fumadocs sites that no longer
exist. Line edits will not save it. Rewrite so that:

- Its documentation-target table lists only real destinations: `README.md`, `CLAUDE.md`,
  `CONTRIBUTING.md`, `LLMS.txt`, and Storybook stories in `apps/story/stories/`.
- Every command resolves against the current root `package.json` — use `bun run story` or
  `bun --filter @repo/story dev` for Storybook. `bun --filter @repo/docs dev|build` must go.
- No mention of Fumadocs, MDX content directories, or `content/docs/` paths remains.

Keep the file's existing frontmatter, structure and voice; replace the content.

If after rewriting there is no meaningful documentation role left for a dedicated agent, deleting
the file is an acceptable outcome — say so explicitly in your report rather than padding it out.

- [ ] **Step 8: Fix the dev command doc**

In `.claude/commands/dev.md`, delete these argument lines:

```markdown
- **legal**: Start legal documentation on port 3002
- **docs**: Start product documentation on port 3003
```

and delete these instruction branches:

```markdown
4. If "legal":
   - Run `bun --filter @repo/legal dev`

5. If "docs":
   - Run `bun --filter @repo/docs dev`
```

No renumbering is needed — branches 1, 2 and 3 (`all`, `www`, `app`) remain and are already
contiguous. Leave the closing line "Run the command in the background so the user can continue
working." in place.

- [ ] **Step 9: Fix CODEOWNERS**

In `.github/CODEOWNERS`, delete lines 10-11:

```
/apps/docs/         @bromso
/apps/legal/        @bromso
```

- [ ] **Step 10: Fix the three issue templates**

In `.github/ISSUE_TEMPLATE/bug_report.yml` and `.github/ISSUE_TEMPLATE/feature_request.yml`, delete
these two dropdown options from each:

```yaml
        - apps/docs (Documentation)
        - apps/legal (Legal)
```

In `.github/ISSUE_TEMPLATE/documentation.yml`, delete:

```yaml
        - apps/docs (Product docs)
        - apps/legal (Legal docs)
```

and replace the placeholder on line 45:

```yaml
      placeholder: e.g., /docs/getting-started or apps/docs/content/...
```

with:

```yaml
      placeholder: e.g., README.md, CLAUDE.md, or apps/story/stories/Button.stories.tsx
```

- [ ] **Step 11: Verify the sweep is complete**

Run:

```bash
grep -rn "apps/docs\|apps/legal\|apps/web\|packages/utils\|@repo/docs\|@repo/legal\|@repo/utils" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude=bun.lock \
  --exclude-dir=docs --exclude=CHANGELOG.md .
for f in .github/ISSUE_TEMPLATE/bug_report.yml .github/ISSUE_TEMPLATE/feature_request.yml .github/ISSUE_TEMPLATE/documentation.yml; do bunx js-yaml "$f" > /dev/null && echo "OK $f"; done
```

Expected: no grep output, then `OK` for each of the three templates.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "docs: purge references to removed apps and packages

apps/docs, apps/legal, apps/web and packages/utils were deleted when this
boilerplate was slimmed down, but 11 files still pointed at them —
including contributor docs telling people to run a dev server that does
not exist, and issue templates offering them as options. docs-writer.md
is rewritten around documentation that actually exists."
```

---

### Task 9: Final verification and push

**Files:** none modified unless a check fails.

**Interfaces:**
- Consumes: every prior task.
- Produces: evidence, plus the pushed branch needed to confirm the Dependabot fix.

- [ ] **Step 1: Verify the local gates**

Run: `bun run typecheck && bun run build && echo "GATES GREEN"`

Expected: `GATES GREEN`.

- [ ] **Step 2: Verify the stale-reference sweep**

Run:

```bash
grep -rn "apps/docs\|apps/legal\|apps/web\|packages/utils\|@repo/docs\|@repo/legal\|@repo/utils" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude=bun.lock \
  --exclude-dir=docs --exclude=CHANGELOG.md .
```

Expected: no output.

- [ ] **Step 3: Verify the deletions**

Run: `ls k8s Makefile .github/workflows/deploy-k8s.yml.disabled scripts/generate-pwa-icons.ts packages/ui/tsconfig.lint.json .agents/skills/apollo-client 2>&1`

Expected: `No such file or directory` for every one.

- [ ] **Step 4: Verify the Storybook suite is green**

Run: `bun --filter @repo/story test --run 2>&1 | tail -6`

Expected: exit 0, 2 files skipped, 1233 tests passing. Takes about 150 seconds.

- [ ] **Step 5: Verify lint has not regressed**

Run: `bunx biome lint . --max-diagnostics=none 2>&1 | grep -E "^Found"`

Expected: `Found 70 errors.` / `Found 415 warnings.` or fewer. A count **above 70** means this work
introduced new lint failures — investigate before proceeding. Never omit `--max-diagnostics=none`;
the default cap of 20 silently truncates.

- [ ] **Step 6: Verify Docker still works**

Run:

```bash
docker compose config --services
docker build -f docker/app.Dockerfile -t hygiene/app:verify .
docker build -f docker/www.Dockerfile -t hygiene/www:verify .
docker build -f docker/dev.Dockerfile -t hygiene/dev:verify .
```

Expected: `app` and `www` only from the first; all three builds succeed.

- [ ] **Step 7: Verify doctor**

Run: `bun run doctor`

Expected: the migrated checks pass. `apps/app/.env.local` may fail — it is gitignored and
machine-local. Do not create it.

- [ ] **Step 8: Push and open the PR**

```bash
git push -u origin chore/repo-hygiene-ci-green
gh pr create --base chore/turborepo-to-bun-workspaces --title "chore: fix dependabot, enable CI, remove dead infra" --body "<summary>"
```

Base the PR on `chore/turborepo-to-bun-workspaces`, **not** `main` — this branch stacks on PR #1.

- [ ] **Step 9: Confirm CI actually runs and goes green**

Run: `gh pr checks --watch`

Expected: the `verify` and `storybook` jobs appear and pass. Before this branch, `gh pr checks`
reported "no checks reported" because every workflow was disabled.

If `verify` fails on `bun install --frozen-lockfile`, the lockfile is out of sync — run
`bun install`, commit `bun.lock`, and push.

- [ ] **Step 10: Confirm the Dependabot jobs recover**

Run: `gh run list --limit 10`

Expected: no `npm_and_yarn in /apps/docs`, `/apps/web` or `/packages/utils` jobs — those
configurations no longer exist. The `github_actions in /.` job should now succeed, because
`.github/workflows/ci.yml` gives it something to scan.

Dependabot runs on a schedule, so this may not appear immediately. If needed, trigger it from the
repository's **Insights → Dependency graph → Dependabot** tab, or simply note that the config no
longer references nonexistent paths and let the daily schedule confirm it.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1. Dependabot — single root entry, keep github-actions, keep ignore rules | 1 |
| 1. Bun lockfile limitation documented | Spec only; no code change required |
| 2. CI — verify + storybook jobs, drop lint/test/e2e, add typecheck, fix cache key | 3 |
| 3. Storybook green via `!test`, with documented fallback | 2 |
| 4. Delete k8s/, Makefile, deploy-k8s workflow | 4 |
| 5. Fix docker-compose.yml, docker-compose.dev.yml, devcontainer | 6 |
| 6. Dead code — 2 files + 5 agent skills | 7 |
| 7. Follow-on cleanup — .vscode, .editorconfig, .claudeignore, workspace file | 5 |
| 8. Stale references across 11 files, docs-writer rewrite | 8 |
| Verification items 1-10 | 9 |

No gaps. Spec section 5's `docker-compose.dev.yml` port cleanup (3002/3003) is covered in Task 6
Step 3 even though the spec mentioned only the mounts — removing mounts while leaving ports for
deleted apps would be half a fix.

**Placeholder scan:** No TBD/TODO, no "similar to Task N", no "handle edge cases". Every step shows
literal before/after content. Task 8 Step 7's rewrite is the only open-ended step; it has explicit
acceptance criteria and a stated permissible alternative.

**Type consistency:** No new TypeScript is introduced. Cross-task name consistency checked:
`chore/repo-hygiene-ci-green` (Global Constraints, Task 9 Step 8), the job names `verify` and
`storybook` (Task 3 Step 3, Task 9 Step 9), and the `!test` tag (Task 2 Steps 2-3, referenced by
Task 3's dependency on a green suite).

**Ordering dependency:** Task 2 must precede Task 3 — CI's `storybook` job runs the suite Task 2
makes green. Task 4 must precede Task 5 — Task 5 cleans up references to what Task 4 deletes.
