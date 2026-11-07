# Security Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A PR fails when it brings in a known high/critical vulnerability (npm dependency or shipped image) or commits a secret; a weekly run on `main` catches new advisories; every accepted risk is a reviewed, expiring allowlist entry.

**Architecture:** One policy file (`security/allowlist.json`) and one pure decision module (`scripts/security/allowlist.ts`), plus three thin scanner scripts (`audit.ts`, `image.ts`, `secrets.ts`) that run their tool, normalise its JSON, apply the allowlist, print a table and write `security/.results/*.json`. Trivy and Gitleaks run from their official images, pinned. CI: a `security` job (secrets every PR/push, audit when dependencies change), Trivy inside the existing `docker` job, the gate, and a weekly `security.yml`.

**Tech Stack:** Bun 1.4.2 (`bun audit`, `bun test`), Docker, Trivy (`aquasec/trivy`), Gitleaks v8 (`ghcr.io/gitleaks/gitleaks`), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-17-security-scanning-design.md`

## Global Constraints

- Severity gate: `high` and `critical` fail unless allowlisted; every secret fails unless allowlisted; lower severities are reported only.
- Allowlist entry: `scanner` (`audit` | `image` | `secrets`), `id`, `package` (audit/image, required), `image` (required for image entries: `app` | `api` | `ai` — each image is scanned by its own process, so only a per-image entry can be judged stale; this tightens the spec's "optional"), `file` (secrets, required), `line` (secrets, optional), `reason` (≥ 20 chars), `expires` (ISO date, ≤ 180 days after the run's date). Expired → fail. Stale (no match in a run of that scanner — for `image`, of that image) → fail. Invalid → fail naming the entry.
- Trivy: `trivy image --format json --ignore-unfixed --severity HIGH,CRITICAL`, cache dir mounted, Docker socket mounted; de-duplicate by (VulnerabilityID, PkgName, InstalledVersion); only VulnerabilityID, PkgName, InstalledVersion, Severity are guaranteed.
- Gitleaks: `gitleaks git --log-opts="<range>"` / `gitleaks git` (history) / `gitleaks dir` (working tree); always `--redact --report-format json --exit-code 0 --no-banner`; a finding is (RuleID, File, StartLine); the secret value never reaches any output.
- Both scanner images pinned to an exact version tag (the latest stable release at implementation time, recorded in one constant per script).
- Results: `security/.results/<scanner>[-<image>].json` (git-ignored), uploaded with `include-hidden-files: true`.
- Local: `bun run security` (audit + working-tree secrets), `bun run security:image <app>`; neither in `bun run ci` / `validate`.
- Scripts live in `scripts/security/` and their tests run in `bun test scripts` — no network, no Docker in tests (fixtures only). CI's planner job runs `bun test scripts` before `bun install`, so these scripts and tests import nothing outside Bun's built-ins and repo-relative files.
- Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Conventional Commits ≤ 100 chars; Biome clean, zero warnings. Implementers never run Playwright, `bun run ci`, `bun run validate` or full builds.

## Review Focus

1. A secret value leaking into logs, the results file, the table or an error message (e.g. Gitleaks' `Secret`/`Match` fields, or an exception printing the raw report) → never; tests assert the serialised output contains no fixture secret (Task 3).
2. A scanner that crashes, cannot pull its image or gets no network silently passing → any tool failure exits non-zero with a clear message, distinct from "findings" (Tasks 2–4).
3. An allowlist entry silently matching too broadly (no package, wrong scanner, an `image` entry for one image applied to another) → matching is exact per field (Task 1).
4. A PR whose base commit is missing from the shallow checkout scanning nothing and passing → the job fetches enough history and the script fails if the range cannot be resolved (Tasks 3 and 5).
5. The stale rule failing a run that legitimately skipped a scanner or image (e.g. the docker job built only `api`) → staleness is judged per scanner run, per image (Task 1 and Task 5).

---

### Task 1: Allowlist core

**Files:** Create `security/allowlist.json` (`[]`), `scripts/security/allowlist.ts`, `scripts/security/allowlist.test.ts`; add `security/.results/` to `.gitignore`.

**Produces:** `type Finding = { scanner: "audit" | "image" | "secrets"; id: string; severity: "low" | "moderate" | "medium" | "high" | "critical" | "secret"; package?: string; image?: string; file?: string; line?: number; installed?: string; fixed?: string; url?: string; title?: string }`; `type Entry` (the fields above); `parseAllowlist(raw: unknown, today: Date): { entries: Entry[]; errors: string[] }`; `decide(findings: Finding[], entries: Entry[], run: { scanner; image?: string }, today: Date): { failing: Finding[]; allowed: Finding[]; reported: Finding[]; expired: Entry[]; stale: Entry[] }`; `formatTable(...)`; `loadAllowlist(path?)`.

- [ ] Tests first: validation (every invalid case names the entry index and field); gating (high/critical/secret fail; low/moderate/medium reported only); matching exactness (scanner, id, package; `image` must match the scanned image; secrets file + optional line); expired; stale only within the same scanner run, and for image entries only within a run of that entry's image; date math in UTC.
- [ ] Implement; `bun test scripts/security`; commit `feat(security): the allowlist and its rules`.

### Task 2: Dependency audit scanner

**Files:** `scripts/security/audit.ts`, `scripts/security/audit.test.ts`, `scripts/security/fixtures/bun-audit.json` (real `bun audit --json` output from this repo, trimmed to a few packages incl. one with two advisories and one advisory listed twice).

- [ ] `normaliseAudit(json): Finding[]` (keyed by package + GHSA id from the advisory URL, de-duplicated; severity mapped as given). CLI: runs `bun audit --json` (`Bun.spawn`), a non-JSON or failed run exits 2 with stderr shown; writes `security/.results/audit.json`; prints the table; exit 1 on failing/expired/stale/invalid, else 0.
- [ ] Tests over the fixture; commit `feat(security): dependency audit scanner`.

### Task 3: Secrets scanner

**Files:** `scripts/security/secrets.ts`, `scripts/security/secrets.test.ts`, `scripts/security/fixtures/gitleaks.json` (real Gitleaks JSON from a throwaway repo seeded with a fake AWS-style key — never a real secret).

- [ ] `normaliseGitleaks(json): Finding[]` → `{ scanner: "secrets", id: RuleID, file: File, line: StartLine, severity: "secret" }` — drop `Secret`, `Match`, `Fingerprint`'s commit part, author/email. CLI flags: none (working tree, `gitleaks dir`), `--range <base>..<head>` (verify both commits exist with `git cat-file -e`, else exit 2), `--history`. Runs the pinned image with the repo mounted read-only; report written to a temp file then read; image pull/run failure exits 2.
- [ ] Tests: normalisation; no fixture secret string anywhere in `JSON.stringify(findings)` or the formatted table; range validation; commit `feat(security): secrets scanner`.
- [ ] Root `package.json`: `"security": "bun scripts/security/audit.ts && bun scripts/security/secrets.ts"`.

### Task 4: Image scanner

**Files:** `scripts/security/image.ts`, `scripts/security/image.test.ts`, `scripts/security/fixtures/trivy.json` (real Trivy JSON of a small public image, trimmed, with a duplicated vulnerability and an entry lacking FixedVersion).

- [ ] `normaliseTrivy(json, image): Finding[]` (de-dupe; severity lowercased; url from PrimaryURL). CLI `--image <tag> --app <app|api|ai>`; runs the pinned Trivy image with `/var/run/docker.sock` and a cache dir (`TRIVY_CACHE_DIR` env or `security/.cache/trivy`, git-ignored) mounted; writes `security/.results/image-<app>.json`. `--build <app>` mode (used by `security:image`) builds the image exactly as CI does (`docker build -f docker/<next|bun-service>.Dockerfile --build-arg APP=<app> --build-arg PORT=<port> -t boilerplate-bun-scan-<app> .`) then scans it.
- [ ] Tests; root script `"security:image": "bun scripts/security/image.ts --build"`; commit `feat(security): container image scanner`.

### Task 5: CI wiring

**Files:** `scripts/ci-plan.ts` (+ `audit: boolean` = not docs-only and (all, or `bun.lock` / any `package.json` changed)), `scripts/ci-plan-run.ts` (output), `scripts/ci-plan.test.ts`; `scripts/ci-gate.ts` (`security` always required) + test; `.github/workflows/ci.yml` (`security` job; docker job `load: true` + tag + Trivy cache + image step + results upload; `ci` needs `security`); `.github/workflows/security.yml` (weekly + dispatch: audit, then a matrix over the three images: build with `load: true`, scan; read-only; timeouts); `scripts/github.test.ts` (asserts the job, the gate, the docker scan step, the weekly workflow's schedule and permissions).

- [ ] `security` job: `actions/checkout` with `fetch-depth: 0` (the planner already does this; the range needs both ends), bun setup, `bun install --frozen-lockfile` only when the audit runs, secrets on `${{ github.event.pull_request.base.sha }}..${{ github.sha }}` (PR) or `${{ github.event.before }}..${{ github.sha }}` (push; a new branch's all-zero `before` → scan just `github.sha`), audit `if: needs.changes.outputs.audit == 'true'`, upload `security/.results`. Timeout ~10 min.
- [ ] Trivy cache: `actions/cache` on the cache dir keyed `trivy-db-${{ date }}` with restore-keys `trivy-db-`.
- [ ] Tests; commit `ci: run the security scans on PRs and weekly`.

### Task 6: First triage — dependencies

- [ ] `bun audit --json` → for each high/critical: `bun audit fix` first; then a root `overrides` entry for an indirect package with a compatible fixed release (never for a catalog-covered package — CLAUDE.md); `bun install`; run the workspace test suites that cover what moved (`bun run test:services` in parts if long) and typechecks — not `validate`/builds/Playwright (controller runs those).
- [ ] Remaining highs → allowlist entries, `expires` = 90 days out, each `reason` concrete (which workspace pulls it in, dev/build-only or runtime, why unreachable or awaiting upstream). Report a table of fixed vs allowlisted.
- [ ] `bun run security` green (audit + secrets); commit `fix(deps): clear or allowlist the high audit findings`.

### Task 7: First triage — images and history (controller-driven)

- [ ] Controller runs `bun run security:image app|api|ai` and `bun scripts/security/secrets.ts --history`, hands findings to an implementer: base-image bumps in `docker/*.Dockerfile` where fixed, else allowlist entries (90 days). A real secret in history: STOP, ask the owner.
- [ ] Commit `fix(docker): clear or allowlist the image scan findings`.

### Task 8: Docs

- [ ] `docs/guides/security-scanning.md`, CLAUDE.md (**Security scanning** under Quality gates; the `security` job and the docker scan in the CI description; the job list), `SECURITY.md` (how we scan), root README guides index, ROADMAP (Phase 9 E stays unticked until merge). Commit `docs: security scanning`.
