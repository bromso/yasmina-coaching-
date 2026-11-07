# Security scanning

Phase 9 E: dependency, container and secrets scanning in CI, beyond what Dependabot already does.
Three small Bun scripts under `scripts/security/` — `audit.ts`, `image.ts`, `secrets.ts` — each run
a pinned scanner, normalise its findings, apply one reviewed policy file
(`security/allowlist.json`) and print a table. A run fails on any high or critical vulnerability
(a dependency advisory, or a container CVE that already has a fix) or any secret the allowlist does
not cover, whether the change brought it in or it was already there when the scanner ran; a weekly
run on `main` catches an advisory published after the PR that introduced it merged. Static analysis
(SAST) and licence scanning are out of scope — see `docs/superpowers/specs/2026-10-17-security-scanning-design.md`
for why.

## What each scan covers, and what it does not

| Scanner | Tool (pinned) | Covers | Does not cover |
|---|---|---|---|
| `audit.ts` | `bun audit --json` | Every advisory in `bun.lock`, direct and transitive, low through critical | A package with no advisory in the npm/GitHub advisory database; reads only the lockfile, so it needs no `bun install` |
| `image.ts` | Trivy `ghcr.io/aquasecurity/trivy:0.76.0` | OS packages and app-layer dependencies in a built image, high and critical only, with a known fix (`--ignore-unfixed`) | A CVE with no fixed version yet — skipped by `--ignore-unfixed` (not reported, not tracked), it surfaces once Debian or the package ships a fix; low/medium findings; secrets (`--scanners vuln` only, by design — that is `secrets.ts`'s job) |
| `secrets.ts` | Gitleaks `ghcr.io/gitleaks/gitleaks:v8.30.1` | Every default Gitleaks rule. Working tree (`gitleaks dir`): only what git would commit — tracked files plus new untracked ones (`git ls-files --cached --others --exclude-standard`), copied into a temp dir first. `--range`/`--history` (`gitleaks git`): committed text, `.gitleaks.toml`-filtered | Anything only ever held in memory or an environment variable; a git-ignored file (`.env`, `*.pem`, `mcp.json`, `.superpowers/`, build output) — never read, since it cannot be committed as it stands; a path whose parent directory, at any depth, is a symlink — skipped with a warning rather than copied into the staged temp dir or failing the run, the same treatment a `missing` or `other`-kind path already gets (`hasSymlinkParent` in `secrets.ts`) |

A finding below the gate (`low`, `moderate`/`medium`) is still printed in the table — it is
**reported, never gating**: it cannot fail a run and never needs an allowlist entry, found or not.
Only `high`, `critical` and `secret` (every secret finding is always this severity) can fail a run.

## Exit codes

Every scanner CLI (`audit.ts`, `image.ts`, `secrets.ts`) and the `security` runner
(`scripts/security/run.ts`, `bun run security`) use the same three codes:

- **0** — clean: no gating finding escaped the allowlist, and no allowlist entry is expired, stale
  or malformed.
- **1** — findings: at least one gating finding has no unexpired matching entry, or an allowlist
  entry is expired, stale or invalid. The scanner ran fine; the result says fix something.
- **2** — tool failure: the scanner itself could not run (Docker not available, the image failed to
  pull, `bun audit` produced no output) or its output could not be parsed as expected. Treat this
  as "the check didn't happen," not "it passed" — nothing was decided.

`bun run security` runs the audit and secrets scanners one after another even when the first
fails, and exits with the worse of the two codes (2 beats 1 beats 0; a process killed by a signal
is clamped to 2 rather than passed through as whatever bare number the OS reports) — chaining them
with `&&` meant this repo's own pre-triage audit failures silently skipped the secrets scan every
single time.

## Reading a failure

The table printed to the console (and written to `security/.results/<scanner>[-<image>].json`) has
one row per finding. For a dependency or image finding: severity, scanner, id, package, image (when
applicable), installed version, fixed version (when Trivy or the advisory knows one) and a link.
For a secret: only the rule id, file and line — never the matched text, never any of Gitleaks' own
`Secret`/`Match`/`Fingerprint`/`Commit`/`Author`/`Email` fields, so a leaked value can never reach
a log line, the results file or this table even if `--redact` itself ever slipped.

Above the table, the scanner also prints why the run failed, one line per cause:

- `<scanner>: allowlist[N].<field>: <problem>` — a malformed entry in `security/allowlist.json`
  (bad JSON shape, a short `reason`, a non-ISO or too-distant `expires`, a missing required field)
  fails every run, not just the scanner that would have used it.
- `<scanner>: allowlist entry expired: <id> (expired <date>)` — same, for a date that has passed.
  This is a date check only: an expired entry in the file fails **every** scanner's run until it is
  renewed or removed, even one owned by a scanner that did not run this time.
- `<scanner>: allowlist entry is stale, no matching finding: <id>` — the entry's own scanner (and,
  for an `image` entry, its own `image`) ran, but found nothing it matches any more. A run that
  skipped that scanner or that image never calls the entry stale. A `secrets` entry is judged stale
  only by a working-tree or `--history` run, never by a `--range` run (CI's PR scan): a range sees
  only its own commits, so an entry for an older commit would otherwise fail every unrelated PR.
- otherwise, the finding itself is in the table with no matching entry — that is the fix: either
  resolve the underlying issue or add an allowlist entry for it.

## Writing an allowlist entry

`security/allowlist.json` is one JSON array, reviewed like any other change. Each entry:

```json
{
  "scanner": "audit",
  "id": "GHSA-xxxx-xxxx-xxxx",
  "package": "rollup",
  "reason": "build-time only: reached through Storybook's bundler, never in a runtime image",
  "expires": "2027-01-15"
}
```

Fields:
- **`scanner`** — `"audit"`, `"image"` or `"secrets"`.
- **`id`** — for `audit` a GHSA id; for `image` a CVE or GHSA id (Trivy's `VulnerabilityID`); for
  `secrets` the Gitleaks rule id.
- **`package`** — required for `audit` and `image`; the advisory's or vulnerability's package name.
  Absent for `secrets`.
- **`image`** — required for `image` entries: `"app"`, `"api"` or `"ai"`, the one scanned image
  this entry covers. Each image is its own scanner run, so only a per-image entry can ever be
  judged stale — an entry for `api` is never touched by a run that scanned `app`.
- **`file`** (required) and **`line`** (optional) — for `secrets` only: the repository-relative
  path Gitleaks reported, and, when given, the exact line. Omitting `line` matches that rule
  anywhere in that file. CI's `--range` scan never calls a `secrets` entry stale (see above); run
  `bun run security` or `--history` locally to find one that no longer matches.
- **`reason`** — at least 20 characters. A good reason names the real dependency chain or context
  and why it is not exploitable here, the way the entries committed in the first triage do:
  > "Dev/test-only: apps/e2e -> lighthouse@12.8.2 -> puppeteer-core@24.43.1 (pinned) ->
  > @puppeteer/browsers -> proxy-agent -> pac-proxy-agent -> get-uri@6.0.5, which requires
  > basic-ftp@^5.0.2. … never reaches a runtime image and only runs in Playwright/Lighthouse CI
  > tooling. Awaiting puppeteer-core/lighthouse to bump get-uri upstream."

  A bad reason is anything a reviewer can't check against the code — `"not exploitable"`,
  `"known issue, fix later"`, `"low risk"` — with no package chain, no scope (dev/build-only vs.
  runtime) and no condition for when it stops applying. It clears the 20-character minimum and
  still tells a reviewer nothing.
- **`expires`** — an ISO `YYYY-MM-DD`, the last day the entry is still active (inclusive), **no
  more than 180 days** after the day the run happens (`MAX_EXPIRES_DAYS`). The cap is on
  `expires` minus each run's own date, never on the entry's age, so it cannot be pre-dated around:
  an entry dated 200 days out is invalid on every run until it is within 180 days, and an old entry
  whose date has passed fails as *expired*, not invalid. The repo's first triage used a tighter **90-day** expiry for every entry it added —
  deliberately shorter than the 180-day cap, so an upstream major-version fix or a still-open
  advisory gets re-looked-at sooner rather than riding the full six months by default. Three of the
  first triage's seven entries (`mathjs` ×2, `style-dictionary`) were removed once
  those majors shipped (the follow-ups sweep bumped `mathjs` to 15 and `style-dictionary` to 5,
  with no code changes either upgrade needed). The other four (`basic-ftp`, `braces`,
  `extract-zip` ×2) went in October 2026: `lighthouse` 13 moved `apps/e2e` onto a
  `puppeteer-core` whose browser downloader depends on neither `basic-ftp` nor `extract-zip`,
  and GitHub withdrew the `braces` advisory, so each entry was stale. The allowlist is empty
  today. When adding entries, stagger their expiry dates so they never all lapse on one day.

## `gitleaks:allow` instead of an allowlist entry

An allowlist entry is for a **risk to revisit** — something real that might change (a fix ships,
a major upgrade becomes worth doing). A permanent false positive — a committed test fixture, a
public dev-only key, a documented example key — never needs revisiting, so it gets an inline
marker on the line itself instead, never an expiring entry:

```ts
export const DEV_TWO_FACTOR_KEY = "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=" // gitleaks:allow
```

```md
The `.p8` is a multi-line PKCS#8 PEM (`-----BEGIN PRIVATE KEY-----`). Put it on one line with <!-- gitleaks:allow -->
literal `\n` escapes, …
```

The `// gitleaks:allow` (or, in Markdown, `<!-- gitleaks:allow -->`) comment must sit **within the
finding's own line range** — Gitleaks only looks at the line(s) it flagged, so a marker on an
unrelated line does nothing. Use it only for a fake that can never become a real secret by being
edited; never for something that merely looks safe today. Diff review is the safety net: a real
secret pasted onto a line that already carries a stale `gitleaks:allow` would still show up in the
PR diff for a reviewer to catch.

## Renewing an expired entry

Re-check the reason still holds (the dependency chain, the scope, whether a fix has shipped since —
run `bun audit` or re-pull the image and look), then bump `expires` to a new date no more than 180
days out. An entry that no longer matches anything (the package was removed, the image rebuilt
without it) should be deleted instead of renewed — leaving it in place would make it fail as stale
the next time its scanner runs.

## The weekly run

`.github/workflows/security.yml` runs the dependency audit and all three image scans
(`app`/`api`/`ai`) every Monday at 06:00 UTC, plus on demand (`workflow_dispatch`); a manual
dispatch queues behind a run already in progress rather than cancelling it, so two can never
race. `ci.yml`'s own `security` and `docker` jobs already cover every PR and push to `main` — this
is the standing check for an advisory or a base-image CVE published against something nobody has
touched since. Each image build passes the UTC date as `APT_REFRESH`, which busts the
Dockerfiles' cached `apt-get upgrade` layer, so the weekly run (and any PR) scans an image with
that day's Debian patches rather than the ones from the day the build cache was filled. A red run shows in the Actions tab and GitHub emails the workflow's owner; nothing
files an issue. Triage it exactly like a PR failure: read the uploaded `security-audit` /
`security-image-<app>` artifact's table, then either fix it or add a reasoned, expiring allowlist
entry in its own PR.

**One shared image-scan workflow.** `ci.yml`'s `docker` job (one PR-affected image at a time) and
`security.yml`'s `image` job (all three, weekly) used to carry the whole build →
restore-cache → scan → chown → save-cache → upload-artifact sequence inline, in both files, kept in
sync only by a test. They now each keep their own `strategy.matrix` (the plan's narrowed rows for
`docker`, a static three-row list for `image`) and delegate the steps themselves to one reusable
workflow, `.github/workflows/image-scan.yml` (`on: workflow_call`, required inputs `dockerfile` /
`app` / `port`), via a job-level `uses:` — so a fix to the shared sequence (such as the cache
freshness check above) can never land in one copy and miss the other. `image-scan.yml` declares
its own job-level `permissions: contents: read`; this is redundant with (not a substitute for)
`ci.yml`'s and `security.yml`'s own top-level `permissions: contents: read`, which already cap it
read-only — permissions flow down from the caller and a called workflow can only narrow them,
never widen them — but it documents and enforces that scope in the file that does the work, too.
Branch protection and `scripts/ci-gate.ts` are unaffected: a job that calls a reusable workflow
keeps its own id (`docker`, `image`) in `needs:`/the `needs` context — only the check-run *label*
GitHub shows changes, to `docker (<dockerfile>, <app>, <port>) / image-scan`.

## Running locally

```bash
bun run security              # audit + secrets scan of the working tree
bun run security:image app    # builds app's image the way CI does, then scans it (needs Docker)
bun run security:image api
bun run security:image ai
bun scripts/security/secrets.ts --history                # every commit, not just the working tree
bun scripts/security/secrets.ts --range <base>..<head>    # one commit range (full SHAs)
```

Neither `bun run security` nor `bun run security:image` is part of `bun run ci` or `bun run
validate` — they need Docker (`image.ts`, `secrets.ts`) or take long enough (a full `--history`
secrets scan) that they stay deliberate, not on every push.

- `bun run security` needs Docker running locally: the audit half (`bun audit --json`) does not,
  but the secrets half always runs Gitleaks via `docker run`, dir mode included. Only
  `bun scripts/security/audit.ts` run on its own needs no Docker at all.
- `bun run security:image <app>` needs Docker too (it shells out to `docker build` then
  `docker run` for Trivy).
- Trivy's vulnerability database is cached under `security/.cache/trivy` by default
  (`TRIVY_CACHE_DIR` overrides it) — gitignored, and kept warm between local runs and, in CI, by
  `actions/cache/restore` + `actions/cache/save` keyed on the UTC date (saved even when the scan
  itself finds vulnerabilities, after a `chown`, since Trivy writes it as root) — but **not** when
  the scan step never ran at all (an earlier step, such as the image build, failed first and left
  the scan `skipped`) — without that condition, a failed build on a day that already had a cache
  miss would re-save whatever older DB `actions/cache/restore` had just restored, under *that
  day's* exact key, a false "fresh" hit for every run the rest of the day — or when
  `db/metadata.json`'s mtime is more than 24h old. That second check is narrower than "this run
  refreshed the database": Trivy rewrites the file only when it downloads a DB, and
  `actions/cache/restore` keeps restored files' original mtimes, so a DB an earlier run downloaded
  within the last day (one Trivy itself still considers current, and so did not re-download)
  passes too. What it guarantees is that the DB saved was downloaded within the last 24h.
  Per-image scan caches stay in memory (`--cache-backend memory`); only the database is kept.
- A force-push to `main` can leave the push event's `before` SHA unreachable; the secrets scan then
  exits 2 ("fetch more history?") and that run stays red until the next push. Nothing is skipped
  silently; re-run after the next push, or scan the range by hand.

## A real secret found

Stop and rotate the credential first — revoking or reissuing it at the provider — before anything
else. Whether to also rewrite git history to remove the committed value is the repository owner's
call, not an automated step: a `gitleaks:allow` or an allowlist entry never belongs on a real
secret, only on a confirmed fake.

## Keeping `.gitleaks.toml` in sync with `.gitignore`

The working-tree scan never reads a git-ignored file: `secrets.ts` copies only what
`git ls-files --cached --others --exclude-standard` lists into a temp dir and scans that.
`gitleaks git` (`--range`, `--history`) has no notion of `.gitignore`, though, so `.gitleaks.toml`'s
`[allowlist].paths` repeats, by hand, every path this repo's `.gitignore` treats as build output, a
cache or a generated artifact (`node_modules/`, `.next/`, `dist/`, `.source/`, `graphify-out/`,
`security/.results/`, …). There is no automated check that the two files never drift, because
Gitleaks' TOML format has no way to import another file's patterns; review any future
`.gitignore` addition against it.

## Pinned scanner versions, and bumping them

Trivy (`TRIVY_IMAGE` in `scripts/security/image.ts`) and Gitleaks (`GITLEAKS_IMAGE` in
`scripts/security/secrets.ts`) are each pinned to one exact tag — `ghcr.io/aquasecurity/trivy:0.76.0` and
`ghcr.io/gitleaks/gitleaks:v8.30.1` as of 2026-10-17 — rather than `:latest`, so a scan's result
depends only on what changed in this repo, not on an upstream release landing mid-week. To bump
one: change the constant, `docker pull` the new tag locally and re-run `bun run security` /
`bun run security:image <app>` / a full `--history` secrets scan against this repo, read the diff
in findings (a newer scanner can both fix false positives and add real new detections), and
allowlist or fix whatever is new before merging the version bump on its own.
