/**
 * Secrets scanner: runs Gitleaks against the working tree (default — only the files git would
 * commit, staged into a temp dir, never a git-ignored one), a commit range or full history, normalises its findings into `Finding[]`, applies `security/allowlist.json` and prints
 * a table, then writes `security/.results/secrets.json`. See
 * `docs/superpowers/specs/2026-10-17-security-scanning-design.md` section 1 and
 * `.superpowers/sdd/2026-10-17-security-scanning/constraints.md`.
 *
 * A secret's value must never reach the results file, the table or a log line: `normaliseGitleaks`
 * only ever reads `RuleID`, `File` and `StartLine` off a raw finding — `Secret`, `Match`,
 * `Fingerprint`, `Commit`, `Author` and `Email` are never touched, so they cannot leak even if
 * Gitleaks' own `--redact` ever failed to scrub one.
 *
 * `bun test scripts` runs with no network and no Docker: `normaliseGitleaks`, `parseSecretsArgs`,
 * `secretsRun`, `parseLsFilesZ`, `planWorkingTreeCopy`, `rangeLogOpts` and `resolveCommit` (the last against this real repo — it only ever shells out to
 * `git`, never Docker, and needs no network) are exercised directly, against a committed fixture
 * (the decide/print/write/exit tail is `report.ts`'s `finish()`, tested once there). `main()` is
 * thin orchestration — it is run for real with `bun run security`, never under the test runner.
 */

import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join, normalize } from "node:path"
import type { Finding, Scanner } from "./allowlist"
import { finish } from "./report"

/**
 * Gitleaks pinned to its latest stable release — checked by `docker pull
 * ghcr.io/gitleaks/gitleaks:v8.30.1` on 2026-10-17, the day this scanner was written.
 */
export const GITLEAKS_IMAGE = "ghcr.io/gitleaks/gitleaks:v8.30.1"

/**
 * One raw Gitleaks JSON finding reduced to exactly what `Finding` needs. Every other field —
 * `Secret`, `Match`, `Fingerprint`, `Commit`, `Author`, `Email`, `Date`, `Message`, `Entropy`,
 * `Tags`, `Description`, `SymlinkFile`, the column numbers — is read by nothing here, so it can
 * never end up in a `Finding`, the results file, the table or an error message.
 */
export function normaliseGitleaks(json: unknown): Finding[] {
  if (!Array.isArray(json)) {
    throw new Error("gitleaks: expected a JSON array of findings")
  }

  return json.map((raw, i) => {
    if (typeof raw !== "object" || raw === null) {
      throw new Error(`gitleaks: finding[${i}] is not an object`)
    }
    const finding = raw as Record<string, unknown>

    if (typeof finding.RuleID !== "string" || finding.RuleID.length === 0) {
      throw new Error(`gitleaks: finding[${i}] has no RuleID`)
    }
    if (typeof finding.File !== "string" || finding.File.length === 0) {
      throw new Error(`gitleaks: finding[${i}] has no File`)
    }
    if (typeof finding.StartLine !== "number" || !Number.isInteger(finding.StartLine)) {
      throw new Error(`gitleaks: finding[${i}] has no StartLine`)
    }

    return {
      scanner: "secrets",
      id: finding.RuleID,
      file: finding.File,
      line: finding.StartLine,
      severity: "secret",
    } satisfies Finding
  })
}

export type SecretsArgs =
  | { mode: "dir" }
  | { mode: "history" }
  | { mode: "range"; base: string; head: string }

/**
 * Pure: parses the CLI flags into what to scan. No flags scans the working tree (`dir`);
 * `--history` scans every commit; `--range <base>..<head>` scans just that range. `--range` and
 * `--history` are mutually exclusive, and a malformed range (missing `..`, an empty base or head)
 * is reported here rather than handed to git. `base`/`head` are returned exactly as given — they
 * are resolved to real commit SHAs separately, by `resolveCommit`/`rangeLogOpts` below, never by
 * string-gluing them into a command.
 */
export function parseSecretsArgs(argv: string[]): SecretsArgs | { error: string } {
  let range: string | undefined
  let history = false

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === undefined) break
    if (arg === "--history") {
      history = true
    } else if (arg === "--range") {
      i++
      const value = argv[i]
      if (value === undefined) return { error: "secrets: --range needs a value" }
      range = value
    } else if (arg.startsWith("--range=")) {
      range = arg.slice("--range=".length)
    } else {
      return { error: `secrets: unknown argument "${arg}"` }
    }
  }

  if (range !== undefined && history) {
    return { error: "secrets: --range and --history are mutually exclusive" }
  }

  if (range !== undefined) {
    const match = /^(.+)\.\.(.+)$/.exec(range)
    const base = match?.[1]
    const head = match?.[2]
    if (base === undefined || head === undefined) {
      return { error: `secrets: --range must look like <base>..<head>, got "${range}"` }
    }
    return { mode: "range", base, head }
  }

  if (history) return { mode: "history" }

  return { mode: "dir" }
}

/**
 * Pure: the run descriptor `finish()` passes to `decide()`. A `--range` run sees only that range's
 * own commits — on a PR, only the PR's — so a secrets allowlist entry for a finding in an older
 * commit would match nothing and fail every unrelated PR as stale. Only working-tree and
 * `--history` runs, which see every finding there is, judge secrets entries stale.
 */
export function secretsRun(args: SecretsArgs): { scanner: Scanner; judgeStale: boolean } {
  return { scanner: "secrets", judgeStale: args.mode !== "range" }
}

/**
 * Pure: the paths `git ls-files -z` printed, NUL-separated, in first-seen order and without
 * repeats. `-z` keeps a name with a space, a quote or a newline intact (git would C-quote it
 * otherwise).
 */
export function parseLsFilesZ(output: string): string[] {
  return [...new Set(output.split("\0").filter((path) => path.length > 0))]
}

export type PathKind = "file" | "symlink" | "missing" | "other"
export type CopyStep = { path: string; kind: "file" | "symlink" }

/**
 * Pure given `lstat`: true when any ancestor directory segment of `path` (not `path` itself) is a
 * symlink. A missing ancestor (`lstat` returns `undefined`, e.g. it doesn't exist) is never
 * treated as one, and a top-level path (no ancestors) is never flagged.
 */
export function hasSymlinkParent(
  path: string,
  lstat: (ancestor: string) => { isSymbolicLink(): boolean } | undefined
): boolean {
  const segments = normalize(path).split("/")
  segments.pop()
  let ancestor = ""
  for (const segment of segments) {
    ancestor = ancestor ? `${ancestor}/${segment}` : segment
    if (lstat(ancestor)?.isSymbolicLink()) return true
  }
  return false
}

/**
 * Pure given `kindOf` (and, for the symlink check, `hasSymlinkParent`): which of git's listed
 * paths to copy into the working-tree scan's staging directory. Regular files are copied and
 * symlinks recreated as links (never followed, so a tracked link can't pull an ignored file such
 * as `.env` in by its target); a path deleted in the working tree (`missing`) or anything else git
 * lists (a submodule's directory) is skipped. A path that is absolute or climbs out of the repo is
 * never planned, whatever git printed — and neither is one whose parent directory is itself a
 * symlink (even when the leaf resolves to an ordinary file or tracked symlink): a directory
 * replaced by a symlink between checkout and scan could otherwise make `copyFileSync` read
 * whatever that link now points at, straight out of the repo's bounds. Skipped rather than
 * failing the whole scan — a path this odd is already in the same "nothing real to stage" bucket
 * as `missing`/`other`, and a hard failure here would turn an unrelated, already-weird working
 * tree into a tool failure for every other file the scan would otherwise have checked.
 */
export function planWorkingTreeCopy(
  paths: string[],
  kindOf: (path: string) => PathKind,
  hasSymlinkParentOf: (path: string) => boolean = () => false
): CopyStep[] {
  const steps: CopyStep[] = []
  for (const path of paths) {
    const normalised = normalize(path)
    if (isAbsolute(normalised) || normalised === ".." || normalised.startsWith("../")) continue
    if (hasSymlinkParentOf(path)) {
      console.warn(`secrets: skipping "${path}": a parent directory is a symlink`)
      continue
    }
    const kind = kindOf(path)
    if (kind === "file" || kind === "symlink") steps.push({ path, kind })
  }
  return steps
}

/** GitHub reports a push's `before` as this when the branch has no prior commit (a new branch). */
export const ZERO_SHA = "0".repeat(40)

const FULL_SHA = /^[0-9a-f]{40}$/

/**
 * Resolves `ref` to the full SHA of the commit it names in `cwd` (the repo), or `null` when it
 * does not name one — including when it names a real object that isn't a commit (a tree or a
 * blob: `^{commit}` makes git refuse those), and including when `ref` isn't a valid revision at
 * all. Never a shell: `Bun.spawnSync` passes `ref` as one argv element straight to `git`, so a
 * string like `HEAD@{now $(id)}` is git's own (loose) reflog-date syntax to parse — `$(id)` is
 * never executed — and still only ever resolves to a commit SHA or fails outright.
 */
export function resolveCommit(ref: string, cwd: string): string | null {
  const proc = Bun.spawnSync(
    ["git", "rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`],
    {
      cwd,
    }
  )
  if (proc.exitCode !== 0) return null
  const sha = proc.stdout.toString().trim()
  return FULL_SHA.test(sha) ? sha : null
}

export type RangeResolution = { logOpts: string } | { error: string }

/**
 * Pure given `resolve`: decides the `--log-opts` value for Gitleaks from a `--range
 * <base>..<head>`, given a function that resolves a ref to a full commit SHA (or `null`). A
 * `base` of all zeros is GitHub's signal for "no prior commit" (a new branch's first push, which
 * has nothing real to diff against) — Gitleaks is then asked to scan just the head commit
 * (`<sha>^!`, equivalent to `-1 <sha>`) instead of a range with no real start. An unresolvable
 * base or head is an error here, before anything is handed to Docker.
 */
export function rangeLogOpts(
  base: string,
  head: string,
  resolve: (ref: string) => string | null
): RangeResolution {
  const headSha = resolve(head)
  if (!headSha) return { error: `cannot resolve commit "${head}" in --range` }

  if (base === ZERO_SHA) {
    return { logOpts: `--log-opts=${headSha}^!` }
  }

  const baseSha = resolve(base)
  if (!baseSha) return { error: `cannot resolve commit "${base}" in --range` }

  return { logOpts: `--log-opts=${baseSha}..${headSha}` }
}

const REPO_ROOT = join(import.meta.dirname, "..", "..")
const RESULTS_DIR = join(REPO_ROOT, "security", ".results")
// The config is mounted read-only on its own (see runGitleaks below), apart from whatever is
// mounted at /repo — a container-side path, hence a literal rather than a `join()`.
const GITLEAKS_CONFIG_IN_CONTAINER = "/gitleaks.toml"

/**
 * Copies every file git would commit — `git ls-files --cached --others --exclude-standard`:
 * tracked files plus new untracked ones, never a git-ignored file (`.env`, `*.pem`, `mcp.json`,
 * `.superpowers/`, build output …) — from the working tree into `dest`, keeping relative paths, so
 * `gitleaks dir` only ever reads what could actually land in a commit. Returns how many paths it
 * staged.
 */
export function stageWorkingTree(dest: string): number {
  const proc = Bun.spawnSync(
    ["git", "ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: REPO_ROOT }
  )
  if (proc.exitCode !== 0) {
    throw new Error(`git ls-files exited ${proc.exitCode}: ${proc.stderr.toString().trim()}`)
  }
  const kindOf = (path: string): PathKind => {
    try {
      const stat = lstatSync(join(REPO_ROOT, path))
      if (stat.isSymbolicLink()) return "symlink"
      return stat.isFile() ? "file" : "other"
    } catch {
      return "missing"
    }
  }
  const lstatAncestor = (ancestor: string) => {
    try {
      return lstatSync(join(REPO_ROOT, ancestor))
    } catch {
      return undefined
    }
  }
  const steps = planWorkingTreeCopy(parseLsFilesZ(proc.stdout.toString()), kindOf, (path) =>
    hasSymlinkParent(path, lstatAncestor)
  )
  for (const { path, kind } of steps) {
    const target = join(dest, path)
    mkdirSync(dirname(target), { recursive: true })
    if (kind === "symlink") symlinkSync(readlinkSync(join(REPO_ROOT, path)), target)
    else copyFileSync(join(REPO_ROOT, path), target)
  }
  return steps.length
}

/**
 * Runs Gitleaks and returns its report as raw text (parsed separately by the caller, so a parse
 * failure never shares this function's error path with an actual Docker/Gitleaks failure).
 *
 * No `--entrypoint sh` and no shell string: every argument is its own argv element, so nothing in
 * `logOptsArg` (ultimately a resolved 40-hex commit SHA, never raw user input — see
 * `rangeLogOpts`) is ever interpreted by a shell. The image's own `safe.directory '*'` (baked in
 * at build time — confirmed with `docker image inspect`/`docker history
 * ghcr.io/gitleaks/gitleaks:v8.30.1`: `RUN git config --global --add safe.directory '*'`, and it
 * runs as root) already covers the bind-mounted repo looking "dubiously owned" to git inside the
 * container, so there is nothing left for a wrapper to configure.
 */
async function runGitleaks(subcommand: "dir" | "git", logOptsArg?: string): Promise<string> {
  const outDir = mkdtempSync(join(tmpdir(), "security-secrets-"))
  // `stageDir`'s own mkdtempSync lives inside the try: were it created (like `outDir` above)
  // before the try started, a failure there — disk full, no /tmp left — would throw past this
  // function's try/finally entirely and leak `outDir`, already created, with nothing left to clean
  // it up. Keeping it as the try's first statement means any failure from here on is covered by
  // the same finally that removes `outDir`.
  let stageDir: string | undefined
  try {
    // `dir` mode scans a staged copy of what git would commit (`stageWorkingTree`), never the real
    // working tree, so a git-ignored file is never read; `git` mode reads the repo's own history.
    if (subcommand === "dir") {
      stageDir = mkdtempSync(join(tmpdir(), "security-tree-"))
      stageWorkingTree(stageDir)
    }
    const args = [
      "docker",
      "run",
      "--rm",
      "-v",
      `${stageDir ?? REPO_ROOT}:/repo:ro`,
      "-v",
      `${join(REPO_ROOT, ".gitleaks.toml")}:${GITLEAKS_CONFIG_IN_CONTAINER}:ro`,
      "-v",
      `${outDir}:/out`,
      "-w",
      "/repo",
      GITLEAKS_IMAGE,
      subcommand,
      ".",
      "--config",
      GITLEAKS_CONFIG_IN_CONTAINER,
      "--redact",
      "--report-format",
      "json",
      "--report-path",
      "/out/report.json",
      "--exit-code",
      "0",
      "--no-banner",
    ]
    if (logOptsArg) args.push(logOptsArg)

    const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" })
    // Gitleaks' own stderr is its non-verbose progress/warning log (commit counts, bytes
    // scanned) — never report content, and never a secret value (which only `--redact`ed JSON
    // in the report file carries) — so echoing it on a Docker/Gitleaks failure is acceptable.
    const [, stderrText] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      throw new Error(
        `docker run exited ${exitCode} (image pull or run failure)${
          stderrText.trim() ? `\n${stderrText.trim()}` : ""
        }`
      )
    }

    return readFileSync(join(outDir, "report.json"), "utf8")
  } finally {
    rmSync(outDir, { recursive: true, force: true })
    if (stageDir) rmSync(stageDir, { recursive: true, force: true })
  }
}

async function main() {
  const args = parseSecretsArgs(process.argv.slice(2))
  if ("error" in args) {
    console.error(args.error)
    process.exit(2)
  }

  const subcommand = args.mode === "dir" ? "dir" : "git"
  let logOptsArg: string | undefined

  if (args.mode === "range") {
    const resolved = rangeLogOpts(args.base, args.head, (ref) => resolveCommit(ref, REPO_ROOT))
    if ("error" in resolved) {
      console.error(`secrets: ${resolved.error} (fetch more history?)`)
      process.exit(2)
    }
    logOptsArg = resolved.logOpts
  }

  let reportText: string
  try {
    reportText = await runGitleaks(subcommand, logOptsArg)
  } catch (error) {
    console.error(`secrets: could not run gitleaks: ${(error as Error).message}`)
    process.exit(2)
  }

  let raw: unknown
  try {
    raw = JSON.parse(reportText)
  } catch {
    // Never interpolate JSON.parse's own message: it can quote a raw token straight out of the
    // report.
    console.error("secrets: gitleaks report is not valid JSON")
    process.exit(2)
  }

  let findings: Finding[]
  try {
    findings = normaliseGitleaks(raw)
  } catch (error) {
    console.error(`secrets: ${(error as Error).message}`)
    process.exit(2)
  }

  process.exit(
    finish({
      label: "secrets",
      findings,
      run: secretsRun(args),
      resultsPath: join(RESULTS_DIR, "secrets.json"),
    })
  )
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`secrets: ${(error as Error).message}`)
    process.exit(2)
  })
}
