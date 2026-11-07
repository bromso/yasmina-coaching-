# Microfrontends + PWA Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert this Bun + Turborepo monorepo into a microfrontend layout where each production app (`www`, `app`) deploys to its own subdomain and is independently installable as a PWA, with shared dependencies centralized in a Bun workspace catalog.

**Architecture:** Pure subdomains, per-origin ServiceWorkers (no literal cross-origin SharedWorker — accepted trade-off documented in design). Each app keeps its own Next.js project; shared code lives in `packages/*` and shared dep versions live in a root `catalog`. Local dev uses `*.localhost` hostnames so dev mirrors production routing. Cookie domain helpers prepare the foundation for `apps/auth` (deferred).

**Tech Stack:** Bun 1.3.13 (catalog protocol), Turborepo, Next.js 16, React 19, Serwist (already wired), Supabase SSR (current auth — NOT Better Auth as CLAUDE.md claims), Biome.

**Design doc:** `docs/plans/2026-05-06-microfrontends-pwa-design.md`

---

## What's Already Done (skip these)

Verified during planning, no work needed:

- Each app has Serwist wired in `next.config.ts` / `next.config.mjs`
- Each app has `src/app/sw.ts` (Serwist entry)
- Each app has `src/app/manifest.ts` (Next.js metadata-style manifest)
- Each app has an `offline/` route for SW fallback
- `@serwist/next` is in each app's deps
- Tree-shaking for `motion`, `@iconify/react`, `@radix-ui` already configured per app

## What This Plan Does

1. **Bun catalog migration** — centralize ~17 shared dep versions at root
2. **Subdomain-aware dev hostnames** — `www.localhost:3000`, `app.localhost:3001`
3. **Cookie domain config for cross-subdomain sessions** — Supabase `cookieOptions.domain` reads from env
4. **CLAUDE.md refresh** — fix stale references (Better Auth → Supabase; remove `apps/legal`, `apps/docs` ghosts; add subdomain conventions)
5. **Verification** — run apps on subdomain hostnames, confirm PWA still installs, typecheck/build pass

## Conventions for This Plan

- All commands run from repo root: `/Users/jonasbroms/Sites/boilerplate`
- Branch: `feat/microfrontends-pwa` (already created)
- Each task gets its own commit using conventional commits
- The pre-existing untouched items (`skills-lock.json` modified, `.agents/skills/skill-creator/`, `.claude/skills/skill-creator` untracked) stay alone throughout

---

## Phase 0: Pre-flight

### Task 0.1: Verify clean state

**Step 1:** Confirm branch and tree

Run: `git branch --show-current && git status --short`
Expected: branch `feat/microfrontends-pwa`; only the 3 pre-existing items in status

**Step 2:** Confirm Bun version supports catalog

Run: `bun --version`
Expected: `1.3.x` or newer (catalog supported since 1.1)

**Step 3:** Smoke-test current dev startup (so we have a known-good baseline)

Run: `bun --filter @repo/www dev` (Ctrl+C after it prints the listening line)
Expected: starts on `http://localhost:3000` without errors

Run: `bun --filter @repo/app dev` (Ctrl+C after listening)
Expected: starts on `http://localhost:3001` without errors

If either fails, STOP and investigate before proceeding.

---

## Phase 1: Bun Catalog Migration

Centralize shared dep versions at root. App `package.json` files declare `"<dep>": "catalog:"`; Bun resolves to the version in root `catalog`.

### Task 1.1: Inventory shared deps

**Step 1:** Identify which deps appear in 2+ workspaces

Run:
```bash
python3 << 'PY'
import json
from pathlib import Path
from collections import defaultdict

root = Path("/Users/jonasbroms/Sites/boilerplate")
files = list((root / "apps").glob("*/package.json")) + list((root / "packages").glob("*/package.json"))
counts = defaultdict(list)

for f in files:
    pkg = json.loads(f.read_text())
    for k in ("dependencies", "devDependencies"):
        for name, ver in (pkg.get(k) or {}).items():
            if name.startswith("@repo/"):
                continue
            if ver.startswith(("workspace:", "catalog:")):
                continue
            counts[name].append((f.parent.name, ver, k))

shared = {n: v for n, v in counts.items() if len(v) >= 2}
for name, occurrences in sorted(shared.items()):
    versions = sorted(set(v for _, v, _ in occurrences))
    print(f"{name}: {versions} in {[w for w, _, _ in occurrences]}")
PY
```

Expected output: list of deps with their workspace + version, e.g.:
```
next: ['^16.0.8'] in ['app', 'www']
react: ['^19.1.1'] in ['app', 'www', 'story', 'ui']
...
```

If a dep shows MULTIPLE versions (e.g., `motion: ['^12.23.26', '^12.34.0']`), record this. The catalog will pin one version — confirm that's acceptable per dep before committing.

**Step 2:** Save the inventory output to a scratch file (NOT committed):

Run: `python3 ... > /tmp/dep-inventory.txt && cat /tmp/dep-inventory.txt`

### Task 1.2: Add `catalog` field to root `package.json`

**Files:**
- Modify: `/Users/jonasbroms/Sites/boilerplate/package.json`

**Step 1:** Read root `package.json` and identify where to insert `catalog` (after `workspaces`, before `scripts`).

**Step 2:** Edit `package.json` to add `catalog`. The catalog should include the deps you found in Task 1.1 with these starter entries (verify each version against the inventory and adjust if any workspace has a different version that should be used):

```json
"catalog": {
  "next": "^16.0.8",
  "react": "^19.1.1",
  "react-dom": "^19.1.1",
  "@types/react": "^19",
  "@types/react-dom": "^19",
  "motion": "^12.23.26",
  "@iconify/react": "^6.0.0",
  "lucide-react": "^0.564.0",
  "next-themes": "^0.4.6",
  "tailwind-merge": "^3.4.0",
  "tailwindcss-animate": "^1.0.7",
  "@hookform/resolvers": "^5.2.2",
  "react-hook-form": "^7.66.1",
  "zod": "^3.23.8",
  "@serwist/next": "^9.2.3",
  "clsx": "^2.1.1",
  "class-variance-authority": "^0.7.1"
}
```

**Important: drift handling:**
- `@iconify/react` exists at `^5.2.0` in `packages/ui` and `^6.0.0` in `apps/story`. The Dependabot PR #1 bumps to `6.0.x` everywhere. If that PR has merged, use `^6.0.0`; if not, leave packages/ui on 5.x for now and only add `@iconify/react` to catalog AFTER the bump lands. **For this work, hold `@iconify/react` out of the catalog initially** to avoid colliding with the open Dependabot PR.
- `motion` exists at `^12.23.26` in `apps/app` and `^12.34.0` in `apps/story`. Pin to `^12.23.26` in catalog (the lower-bound caret accepts both).

**Step 3:** Save the file.

**Step 4:** Run `bun install` to validate the catalog field is recognized

Run: `bun install`
Expected: install succeeds; lockfile updated; no errors about unknown `catalog` key

If Bun complains about the `catalog` field, check Bun version (must be 1.1+).

**Step 5:** Commit

```bash
git add package.json bun.lock
git commit -m "feat(deps): add Bun workspace catalog for shared deps

Centralizes versions for next, react, motion, zod, etc. at root.
Apps will switch to 'catalog:' protocol in the next commit."
```

### Task 1.3: Migrate `apps/www` to catalog protocol

**Files:**
- Modify: `/Users/jonasbroms/Sites/boilerplate/apps/www/package.json`

**Step 1:** Read current www `package.json`. Identify which of its deps are in the root catalog.

**Step 2:** For each catalog dep, replace the version string with `"catalog:"`. Example diff:

```diff
-    "next": "^16.0.8",
+    "next": "catalog:",
-    "react": "^19.1.1",
+    "react": "catalog:",
-    "motion": "^12.23.24",
+    "motion": "catalog:",
```

**Do NOT** change deps that aren't in the catalog (e.g., `@mdx-js/react`, `next-safe-action`, `@radix-ui/react-*` — these stay per-app for now).

**Do NOT** change `@repo/*` workspace deps.

**Step 3:** Run `bun install` from repo root

Run: `bun install`
Expected: install succeeds; no version errors

**Step 4:** Verify www can still start

Run: `bun --filter @repo/www dev`
Expected: starts on `localhost:3000` (Ctrl+C after confirming)

**Step 5:** Commit

```bash
git add apps/www/package.json bun.lock
git commit -m "feat(www): migrate shared deps to workspace catalog"
```

### Task 1.4: Migrate `apps/app` to catalog protocol

**Files:**
- Modify: `/Users/jonasbroms/Sites/boilerplate/apps/app/package.json`

Same workflow as Task 1.3, applied to `apps/app`. App-specific deps stay (e.g., `@apollo/client`, `@dnd-kit/*`, `@supabase/*`, `recharts`, `@tanstack/react-table`, `vaul`).

**Step 1:** Edit `apps/app/package.json`, switch each catalog dep to `"catalog:"`.

**Step 2:** `bun install`

**Step 3:** Verify

Run: `bun --filter @repo/app dev`
Expected: starts on `localhost:3001` (Ctrl+C after confirming)

**Step 4:** Commit

```bash
git add apps/app/package.json bun.lock
git commit -m "feat(app): migrate shared deps to workspace catalog"
```

### Task 1.5: Migrate `apps/story` to catalog protocol

**Files:**
- Modify: `/Users/jonasbroms/Sites/boilerplate/apps/story/package.json`

Same as 1.3 but for `apps/story`. Story-specific deps (Storybook itself, vitest) stay.

**Note:** Story has `motion: ^12.34.0` while catalog has `^12.23.26`. The caret accepts the existing version, so `motion: catalog:` works — but the actual installed version may downgrade slightly. Run `bun --filter @repo/story dev` after to verify nothing broke.

**Step 1:** Edit `apps/story/package.json`.

**Step 2:** `bun install`.

**Step 3:** Verify Storybook still starts

Run: `bun --filter @repo/story dev`
Expected: Storybook starts on `localhost:6006` (Ctrl+C after confirming)

**Step 4:** Commit

```bash
git add apps/story/package.json bun.lock
git commit -m "feat(story): migrate shared deps to workspace catalog"
```

### Task 1.6: Migrate `packages/ui` to catalog protocol

**Files:**
- Modify: `/Users/jonasbroms/Sites/boilerplate/packages/ui/package.json`

**Note:** `packages/ui` has many deps not in the catalog (Radix primitives, R3F, GSAP, etc.). Only switch the ones IN the catalog (react, react-dom, lucide-react, tailwind-merge, etc.).

**Important quirk:** `packages/ui` uses `@iconify/react: ^5.2.0`. Per Task 1.2 we held `@iconify/react` OUT of the catalog initially. So `packages/ui` keeps its own version. After Dependabot PR #1 merges and you bump packages/ui to `^6.0.0`, you can revisit and add it to the catalog.

**Step 1:** Edit `packages/ui/package.json`, switch eligible deps.

**Step 2:** `bun install`.

**Step 3:** Sanity check — re-run Storybook (which depends on `@repo/ui`)

Run: `bun --filter @repo/story dev`
Expected: starts cleanly

**Step 4:** Commit

```bash
git add packages/ui/package.json bun.lock
git commit -m "feat(ui): migrate shared deps to workspace catalog"
```

### Task 1.7: Verify catalog migration end-to-end

**Step 1:** Type-check across the monorepo

Run: `bun typecheck`
Expected: all workspaces pass

**Step 2:** Build (this also exercises Webpack + Serwist)

Run: `bun run build`
Expected: all apps build successfully

**Step 3:** No commit needed if everything passes — the previous commits already locked in the changes.

If `build` or `typecheck` fails, identify the broken workspace, fix the catalog entry version (e.g., bump catalog version to match a workspace's needed version), commit the fix, and re-run.

---

## Phase 2: Subdomain-Aware Dev Hostnames

Switch dev servers from `localhost:<port>` to `<app>.localhost:<port>`. Modern browsers auto-resolve `*.localhost` → `127.0.0.1`. No `/etc/hosts` edits needed.

### Task 2.1: Add hostname binding to `apps/www` dev script

**Files:**
- Modify: `/Users/jonasbroms/Sites/boilerplate/apps/www/package.json` (only the `scripts.dev` line)

**Step 1:** Find the dev script. It currently reads:

```json
"dev": "next dev",
```

**Step 2:** Change to:

```json
"dev": "next dev --hostname www.localhost",
```

**Step 3:** Test

Run: `bun --filter @repo/www dev`
Expected: prints `Local: http://www.localhost:3000` (or similar). Open `http://www.localhost:3000` in a browser; the page should load. Ctrl+C.

**Step 4:** Commit

```bash
git add apps/www/package.json
git commit -m "feat(www): bind dev server to www.localhost"
```

### Task 2.2: Add hostname binding to `apps/app` dev script

**Files:**
- Modify: `/Users/jonasbroms/Sites/boilerplate/apps/app/package.json`

Same as 2.1, applied to `apps/app`. The current dev script is:

```json
"dev": "next dev --port 3001",
```

Change to:

```json
"dev": "next dev --port 3001 --hostname app.localhost",
```

**Step 1:** Edit, save.

**Step 2:** Test

Run: `bun --filter @repo/app dev`
Expected: prints `Local: http://app.localhost:3001`. Open in browser. Ctrl+C.

**Step 3:** Commit

```bash
git add apps/app/package.json
git commit -m "feat(app): bind dev server to app.localhost"
```

### Task 2.3: Document subdomain dev URLs

`apps/story` does NOT change — Storybook is a tools app, not a routed product. Stays at `localhost:6006`.

No commit yet — documentation update happens in Task 4.1 with the CLAUDE.md refresh.

---

## Phase 3: Cookie Domain for Cross-Subdomain Sessions

Configure Supabase SSR client to set session cookies on the `.brand.com` parent domain (and `.localhost` in dev) so future `auth.brand.com` can issue sessions usable on `app.brand.com`.

**Note:** This project uses **Supabase SSR**, not Better Auth (despite CLAUDE.md). Cookie domain is set via `cookieOptions` on `createServerClient` / `createBrowserClient`.

### Task 3.1: Add cookie domain helper

**Files:**
- Create: `/Users/jonasbroms/Sites/boilerplate/apps/app/src/lib/cookie-domain.ts`

**Step 1:** Create the file:

```ts
/**
 * Cookie domain for cross-subdomain auth sessions.
 *
 * Production: ".brand.com" (replace with actual domain via env)
 * Dev: ".localhost" — auto-shared across *.localhost subdomains
 *
 * Reads from NEXT_PUBLIC_COOKIE_DOMAIN env if set, falls back to
 * sensible defaults per NODE_ENV.
 */
export function getCookieDomain(): string | undefined {
  if (process.env.NEXT_PUBLIC_COOKIE_DOMAIN) {
    return process.env.NEXT_PUBLIC_COOKIE_DOMAIN
  }
  if (process.env.NODE_ENV === "development") {
    return ".localhost"
  }
  // In production, return undefined to fall back to host-only cookie
  // unless an explicit env override is set. Avoids accidentally setting
  // cookies on the wrong domain in CI/preview deploys.
  return undefined
}
```

**Step 2:** Save.

### Task 3.2: Wire cookie domain into Supabase clients

**Files:**
- Modify: `/Users/jonasbroms/Sites/boilerplate/apps/app/src/lib/supabase.ts`
- Modify: `/Users/jonasbroms/Sites/boilerplate/apps/app/src/lib/supabase-server.ts`

**Step 1:** Read each file. Identify the `createBrowserClient` / `createServerClient` calls.

**Step 2:** Add `cookieOptions: { domain: getCookieDomain() }` to each client config. Example:

```ts
import { createBrowserClient } from "@supabase/ssr"
import { getCookieDomain } from "./cookie-domain"

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookieOptions: {
      domain: getCookieDomain(),
    },
  },
)
```

**Important:** Do NOT change any other behavior — just add the `cookieOptions.domain`. Read the existing file shape carefully before editing; some files may already have a `cookies` object you need to extend.

**Step 3:** Run typecheck

Run: `bun --filter @repo/app run check 2>/dev/null || bun typecheck`
Expected: no new errors

**Step 4:** Smoke test

Run: `bun --filter @repo/app dev`
Open `http://app.localhost:3001` in a browser. If the app has any auth flow accessible without an account (e.g., the login page renders), confirm it loads without errors. Ctrl+C.

**Step 5:** Commit

```bash
git add apps/app/src/lib/cookie-domain.ts apps/app/src/lib/supabase.ts apps/app/src/lib/supabase-server.ts
git commit -m "feat(auth): wire cookie domain helper for cross-subdomain sessions

Cookies set on .localhost in dev (shared across *.localhost) and
on the env-configured domain in production. Foundation for future
auth.brand.com subdomain."
```

### Task 3.3: Add `.env.example` entry

**Files:**
- Modify: `/Users/jonasbroms/Sites/boilerplate/.env.example`

**Step 1:** Append:

```
# Cookie domain for cross-subdomain auth sessions.
# Set to ".brand.com" (your eTLD+1, with leading dot) in production.
# Leave unset in dev — defaults to ".localhost".
NEXT_PUBLIC_COOKIE_DOMAIN=
```

**Step 2:** Commit

```bash
git add .env.example
git commit -m "docs(env): document NEXT_PUBLIC_COOKIE_DOMAIN"
```

---

## Phase 4: CLAUDE.md Refresh

Update `CLAUDE.md` to reflect the actual stack and the new conventions.

### Task 4.1: Update CLAUDE.md

**Files:**
- Modify: `/Users/jonasbroms/Sites/boilerplate/CLAUDE.md`

**Step 1:** Read current `CLAUDE.md`.

**Step 2:** Make these edits:

1. **Apps section** — remove references to `apps/legal` and `apps/docs` (they don't exist on disk). Update to:
   ```
   **Apps:**
   - `apps/www` — Marketing/landing site (www.localhost:3000 dev → www.brand.com prod)
   - `apps/app` — Main dashboard application (app.localhost:3001 dev → app.brand.com prod)
   - `apps/story` — Storybook for packages/ui (localhost:6006 dev, internal tool only)
   ```

2. **Authentication section** — replace the Better Auth references with Supabase:
   ```
   **Authentication (apps/app):**
   - Supabase SSR via `@supabase/ssr` (`apps/app/src/lib/supabase.ts`, `supabase-server.ts`)
   - Cookie domain configurable via `NEXT_PUBLIC_COOKIE_DOMAIN` env (helper in `apps/app/src/lib/cookie-domain.ts`)
   - Middleware: `apps/app/src/middleware.ts`
   ```

3. **Add a new "Microfrontend Architecture" section** after the existing Architecture section:
   ```
   ## Microfrontend Architecture

   Each production app deploys to its own subdomain. Per-origin ServiceWorker means each app is independently installable as a PWA.

   - **Dev URLs:** `*.localhost` (modern browsers auto-resolve)
   - **Cookie domain:** `.localhost` in dev, `.brand.com` (or env override) in prod
   - **Shared client state:** lives in cookies on the parent domain — NOT in cross-origin SharedWorker (browser scopes prohibit)
   - **Adding a new subdomain app:**
     1. Scaffold under `apps/<name>/` (Next.js project)
     2. Set its dev script to `next dev --port <unique-port> --hostname <name>.localhost`
     3. Use `catalog:` for shared deps
     4. Add Serwist setup if PWA features are wanted
     5. Configure Vercel project for `<name>.brand.com`
   ```

4. **Add a "Dependency Versioning" section:**
   ```
   ## Dependency Versioning (Bun catalog)

   Shared dep versions live in the root `package.json` `catalog` field. Apps reference them via `"<dep>": "catalog:"`. This is the single source of truth for `next`, `react`, `motion`, `zod`, etc.

   To bump a shared dep:
   1. Edit the version in root `package.json` `catalog`
   2. Run `bun install`
   3. Test affected apps
   4. Add a changeset if user-visible
   ```

**Step 3:** Save and commit:

```bash
git add CLAUDE.md
git commit -m "docs(claude): refresh CLAUDE.md for MFE architecture

- Remove ghost references to apps/legal and apps/docs (don't exist)
- Correct auth stack: Supabase SSR (was Better Auth)
- Document subdomain dev URLs and cookie domain
- Document Bun catalog conventions"
```

---

## Phase 5: Final Verification

### Task 5.1: Full validation

**Step 1:** Type-check

Run: `bun typecheck`
Expected: pass

**Step 2:** Lint

Run: `bun lint`
Expected: pass (note: may fail with `biome: command not found` if `node_modules` aren't fresh; in that case `bun install` first)

**Step 3:** Build

Run: `bun run build`
Expected: all 3 apps (www, app, story) build cleanly

**Step 4:** PWA smoke test

Run: `bun --filter @repo/www dev` in one terminal, `bun --filter @repo/app dev` in another.

In a browser:
- Visit `http://www.localhost:3000` — open DevTools → Application → Service Workers — confirm SW is registered
- Visit `http://app.localhost:3001` — same check
- Open DevTools → Application → Manifest — confirm manifest loads with name + icons

Both apps should show "Installable" in the Application tab if everything's wired right (this is a manual check; document the result in the next task's commit message).

**Step 5:** Cookie domain smoke test

In dev tools at `http://app.localhost:3001`, open Application → Cookies. Any auth-related cookie set during a login attempt should have `Domain=.localhost`.

If the cookie has `Domain=app.localhost` (host-only), check that `getCookieDomain()` returned `.localhost` correctly — likely `NODE_ENV` not picked up.

### Task 5.2: Final summary commit (only if anything was tweaked during 5.1)

If verification passed without changes, no commit needed.

If a tweak was needed (e.g., catalog version mismatch surfaced during build), commit it with a clear message:

```bash
git add <fixed files>
git commit -m "fix(<scope>): <what you fixed during verification>"
```

---

## Phase 6: Push & PR

### Task 6.1: Push and open PR

**Step 1:** Push

```bash
git push -u origin feat/microfrontends-pwa
```

**Step 2:** Open PR

```bash
gh pr create --title "feat: microfrontends + PWA infra" --body "$(cat <<'EOF'
## Summary

Sets up the monorepo for subdomain-based microfrontend deployment, with each app independently installable as a PWA.

- **Bun workspace catalog** centralizes versions for ~17 shared deps (next, react, motion, zod, serwist, etc.) at root
- **Subdomain dev URLs** (www.localhost:3000, app.localhost:3001) — apps now bind to the hostname they'll use in prod
- **Cookie domain helper** in apps/app — sets session cookies on .localhost in dev, env-configured domain in prod (foundation for future auth.brand.com)
- **CLAUDE.md refresh** — fixes stale references (Better Auth → Supabase, removes apps/legal/apps/docs ghosts), documents new MFE conventions

PWA infrastructure (Serwist, sw.ts, manifest.ts, offline page) was already wired in both apps — verified, no changes needed.

Design: docs/plans/2026-05-06-microfrontends-pwa-design.md

## Test plan

- [ ] bun install regenerates lockfile cleanly
- [ ] bun typecheck passes
- [ ] bun run build builds all 3 apps
- [ ] www.localhost:3000 loads, SW registers, manifest valid
- [ ] app.localhost:3001 same
- [ ] Cookies set during auth flow show Domain=.localhost in dev
- [ ] Storybook still starts at localhost:6006

## Out of scope (deferred follow-ups)

- Creating apps/auth, apps/docs, apps/help (cookie-cutter when needed)
- packages/workers for typed Worker wrappers (YAGNI)
- Vercel multi-project deployment config
- Adding @iconify/react to catalog (held out pending Dependabot PR #1 merge)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Done Criteria

- [ ] Root `package.json` has a `catalog` field with shared dep versions
- [ ] `apps/www`, `apps/app`, `apps/story`, `packages/ui` reference shared deps as `catalog:`
- [ ] `apps/www` dev binds to `www.localhost`, `apps/app` to `app.localhost`
- [ ] `apps/app` cookies use `getCookieDomain()`-derived domain
- [ ] CLAUDE.md reflects actual stack (Supabase, not Better Auth) and documents MFE conventions
- [ ] `bun typecheck` and `bun run build` pass
- [ ] PWA SW registers on both `www.localhost:3000` and `app.localhost:3001`
- [ ] Branch pushed, PR opened
