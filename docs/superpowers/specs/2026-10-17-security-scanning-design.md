# Security scanning — design (Phase 9 E)

Phase 9's last item: "dependency and container scanning in CI, beyond what Dependabot already does".
Approved in chat on 2026-10-17. One PR.

## Intent

Fail a pull request when it brings in a known high or critical vulnerability, in an npm dependency
or in a shipped container image, or when it commits a secret. A weekly run on `main` catches
advisories published since the last PR. Every accepted risk is written down, explained and expires.

Decided with the owner:
- **Scope:** dependencies, container images and secrets. Static analysis (SAST) is out.
- **Policy:** fail + allowlist. A high or critical finding, or any secret, fails unless an
  unexpired allowlist entry with a reason matches it. Expired and stale entries fail too.
- **When:** on PRs where a change can matter, plus a weekly scheduled run on `main`.
- **Approach A:** one policy file, one small Bun script per scanner, scanner images pinned. No
  third-party GitHub Actions in the security path.

Constraints: the repository is private, so GitHub's code-scanning dashboard (CodeQL / SARIF
upload) is unavailable; results live in job logs and an uploaded artifact. Actions minutes have run
out three times, so each scan must be cheap and run only where it can find something.

State on 2026-10-17: `bun audit` (Bun 1.4.2) reports 48 high, 0 critical, 29 moderate and 2 low
advisories, all in indirect dependencies, most of them build or dev tooling.

## 1. The policy file and the scanners

`security/allowlist.json` is one reviewed list for all three scanners:

```json
[
  {
    "scanner": "audit",
    "id": "GHSA-xxxx-xxxx-xxxx",
    "package": "rollup",
    "reason": "build-time only: reached through Storybook's bundler, never in a runtime image",
    "expires": "2027-01-15"
  }
]
```

Fields:
- `scanner`: `audit`, `image` or `secrets`.
- `id`: for `audit` a GHSA id; for `image` a CVE or GHSA id; for `secrets` the Gitleaks rule id.
- `package`: required for `audit` and `image` (the advisory's package); absent for `secrets`.
- `image`: required for `image` entries — which scanned image (`app`, `api`, `ai`) the entry
  covers. Each image is scanned by its own process, so only a per-image entry can be judged stale.
- `file`: required for `secrets` — the repository-relative path; `line` optional.
- `reason`: at least 20 characters.
- `expires`: an ISO date, no more than 180 days after the day the run happens.

`scripts/security/allowlist.ts` (pure, no I/O) validates entries and decides:
- a finding of severity high or critical — or any secret — fails unless an unexpired entry matches
  it (same scanner, id, and package/image or file/line as applicable);
- an expired entry fails the run;
- an entry that matches no finding in a run of its scanner fails as stale. A run that did not
  execute that scanner (or, for `image`, that image) never calls the entry stale;
- findings below high are reported, never fail and never need an entry;
- an invalid entry (missing or short reason, bad or too-distant date, unknown scanner, missing
  required field) fails the run naming the entry.

Scanners, each in `scripts/security/`, each running its tool, parsing the JSON, applying the
allowlist, printing a table (finding, package, installed and fixed version when known, link) and
writing normalised findings to `security/.results/<scanner>[-<image>].json`:

- **`audit.ts`** — `bun audit --json` (Bun pinned by `packageManager`). A package can carry several
  advisories, and the same advisory more than once; findings are keyed by package and advisory id.
- **`image.ts --image <tag> --app <name>`** — Trivy from its official image, pinned to an exact
  version, against a local Docker image through the Docker socket:
  `trivy image --format json --ignore-unfixed --severity HIGH,CRITICAL <tag>` with a cache
  directory mounted. Trivy's report can list the same vulnerability twice; findings are de-duplicated
  by vulnerability id, package and installed version. Only `VulnerabilityID`, `PkgName`,
  `InstalledVersion` and `Severity` are guaranteed; `FixedVersion` and links may be empty.
  `--ignore-unfixed` means an OS CVE with no fix never blocks anything.
- **`secrets.ts [--range <base>..<head> | --history]`** — Gitleaks from its official image, pinned:
  `gitleaks git --log-opts="<range>"` for a commit range, `gitleaks git` over all history with
  `--history`, `gitleaks dir` for the working tree by default; always `--redact`,
  `--report-format json`, `--exit-code 0` (the script decides). A finding is reduced to rule id,
  file and line; a secret's value never reaches the results file, the table or the log.

Local use:
- `bun run security` — the audit and the working-tree secrets scan.
- `bun run security:image <app>` — builds that app's image the way CI does and scans it (needs
  Docker).
- Neither is added to `bun run ci` or `bun run validate`.

## 2. CI

- **`security` job in `ci.yml`**, on every PR and every push to `main`, docs-only changes included:
  - secrets: on a PR, the checkout fetches the base commit and `secrets.ts` scans
    `base..head`; on a push, the pushed range;
  - audit: in the same job, only when the plan's new `audit` output is true — `bun.lock`, any
    `package.json`, or a root file changed — and on every non-docs push to `main`.
  `scripts/ci-plan.ts` gains the `audit` output (tested in `ci-plan.test.ts`).
- **Images**: in the existing `docker` job, each matrix row's build step adds `load: true`, then
  `bun scripts/security/image.ts --image <tag> --app <app>` runs. Trivy's database is cached with
  `actions/cache` keyed by the UTC date. No extra job, no extra builds.
- **Gate**: `security` joins the final `ci` job's `needs` and `scripts/ci-gate.ts`;
  `scripts/github.test.ts` checks the job exists, the gate needs it, and the docker job runs the
  image scan.
- **Weekly**: `.github/workflows/security.yml` — Mondays 06:00 UTC and `workflow_dispatch`; audit plus
  the image scans of all three images on `main`; `permissions: contents: read`; job timeouts like
  the other workflows; no issue creation. A scheduled failure shows in Actions and GitHub emails the
  workflow's owner.
- **Reports**: `security/.results/` is uploaded as an artifact (`include-hidden-files: true`).

## 3. Testing, triage and docs

- `bun test scripts`, with no network and no Docker:
  - `allowlist.test.ts` — validation and every decision rule above;
  - `audit.test.ts`, `image.test.ts`, `secrets.test.ts` — committed fixtures of each tool's real JSON
    output (captured once, trimmed): duplicates, empty optional fields, redaction (no secret value
    in any output), exit status for new, allowed and expired cases;
  - `ci-plan.test.ts`, `github.test.ts` — the `audit` output, the job, the gate, the docker step.
- Before merge the controller runs `bun run security`, `security:image` for all three images, and one
  full-history Gitleaks scan. A real leaked secret stops the work: rotating it and rewriting history
  are the owner's decisions.
- First triage, its own commit: `bun audit fix`, then root `overrides` for indirect dependencies with a
  compatible fixed release (allowed: the catalog does not cover them), then the full gate
  (`bun run validate` and the e2e suite). What remains gets allowlist entries with concrete reasons
  and a 90-day expiry.
- Docs: `docs/guides/security-scanning.md` (what each scan covers and does not, reading a failure,
  writing an allowlist entry and a good reason, renewing, the weekly run, local use, a real secret:
  rotate first); CLAUDE.md (a **Security scanning** paragraph under Quality gates; the new job in the
  CI description); `SECURITY.md` (how we scan); ROADMAP Phase 9 E ticked on merge.

## Out of scope

SAST, licence scanning, SBOM publishing, Dependabot auto-merge changes, GitHub code-scanning upload.
