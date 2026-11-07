# @repo/api-contract

The typed oRPC contract (`@orpc/contract` + Zod schemas) for `apps/api`'s internal, session- and
service-token-authenticated procedures — `auth.*`, `account.*`, `workspaces.*`, `invitations.*`,
`billing.*`, `admin.*` and the rest. Every caller imports `ApiClient` from here, never from
`apps/api` itself: the api implements the contract (`apps/api/src/router.ts`), and a typecheck
fails the moment a handler stops matching it. This is the *internal* contract; the public,
API-key-authenticated `/v1` surface has its own, separately versioned one,
`@repo/public-api-contract` (see its own README).

## Zod-free subpaths

Most of the package's root (`.`) pulls in Zod and the whole contract — fine for server code and
`createAuth` clients, wrong for a client component, which must not ship either into the browser
bundle. The subpaths below import nothing at all — not even `zod`, and no other package either,
transitively through every file they reach by relative import inside `packages/api-contract/src`:
constants, pure functions and plain TypeScript types only, safe for a `"use client"` file to import
directly.

| Subpath | What it carries |
|---|---|
| `./api-keys-limits` | `API_SCOPES`, `MAX_API_KEYS` and related messages |
| `./application-statuses` | the job-application status vocabulary |
| `./billing-plans` | `PLANS`, `entitlementsFor` and friends |
| `./email-change-limits` | email-change rate-limit constants |
| `./files-limits` | `MAX_IMAGE_BYTES`, `FILE_KEY_PATTERN` |
| `./invite-domains` | the invitation domain allowlist's normaliser and matcher — see below |
| `./jobs-limits` | `MAX_CV_BYTES`, `JOBS_RATE_MESSAGE` and the apply form's other limits |
| `./passkey-limits` | `MAX_PASSKEYS` and related messages |
| `./roles` | `ROLES`, `ASSIGNABLE_ROLES`, `roleAtLeast` |
| `./route` | the `route` metadata helper shared by every procedure |
| `./support-limits` | `SUPPORT_TOPICS` and the contact-form rate limits |
| `./telemetry-limits` | telemetry rate-limit constants |
| `./webhooks-limits` | `MAX_WEBHOOK_ENDPOINTS` and related messages |
| `./workspace-activity` | `WORKSPACE_ACTIVITY_ACTIONS`, `WORKSPACE_ACTIVITY_DAYS` and the activity vocabulary |

A second group of subpaths — `./analytics`, `./jobs`, `./realtime` and `./support` — is kept
*narrow*: none imports the main index, so server code can pull in just one feature's schemas. They
are not small, though, and every one imports `zod` itself:

| Subpath | Imports |
|---|---|
| `./analytics` | `zod`, `./route`, `./telemetry` (itself `zod` + `./telemetry-limits`) |
| `./jobs` | `zod`, `./application-statuses`, `./jobs-limits`, `./auth` (`zod` + `@repo/i18n/locales`), `./files` (`zod` + `./files-limits`) |
| `./realtime` | `zod`, `./note` (`zod` + `./ids`) |
| `./support` | `zod`, `./support-limits`, `./auth` (`zod` + `@repo/i18n/locales`) |

So none is safe for a client bundle: a `"use client"` file after the same constant (`apps/jobs`'s
apply form, say) imports `./jobs-limits` directly instead of `./jobs`. `./realtime` is the
narrowest — a realtime client still skips auth, billing and admin's schemas — but it isn't
*Zod*-free either.

`scripts/client-imports.test.ts` (in `bun test scripts`) fails the moment a client component — or a
local module it pulls in with no `"use client"`/`"use server"` directive of its own — imports a
*value* from the bare `@repo/api-contract` specifier, or from one of the narrow-but-not-Zod-free
subpaths above, instead of a genuinely Zod-free one (the same guard covers
`@repo/public-api-contract` and `@repo/sites`).

## Invitation domains

`./invite-domains` (Zod-free) is the shared rule behind the workspace invitation domain allowlist
(see CLAUDE.md's **Invitation domains.** paragraph and `apps/api/README.md`'s own section): both
`apps/api` and `apps/account` normalise and match with these exact functions, so the two can never
disagree about what counts as a valid domain or a match.

- `MAX_INVITE_DOMAINS` (20) — the most domains a workspace may list.
- `normalizeInviteDomain(input): string | null` — one line to its stored A-label form, or `null`
  when it is not a usable email domain.
- `normalizeInviteDomains(lines)` — a whole list: deduped, first-seen order kept, each invalid
  line's 0-based index, and whether more than `MAX_INVITE_DOMAINS` remain.
- `emailDomain(address)` — everything after an address's last `@`.
- `inviteDomainAllowed(domains, address)` — whether `address` may be invited under `domains` (empty
  list = any address, otherwise an exact match).
- `toASCII(domain)` — the ASCII (A-label) conversion `normalizeInviteDomain` itself uses (`new
  URL("http://" + domain).hostname`, the WHATWG URL host parser — the browser-safe equivalent of
  `node:url`'s `domainToASCII`, which Next's client-side `url` shim does not implement).

## Where things live

- `src/index.ts` — the oRPC contract itself (`oc.router(...)`), `ApiClient`, and the schemas every
  procedure's input/output/declared errors are built from.
- `src/*.ts` next to it — one file per subpath listed above (Zod-free or narrow), plus the Zod
  schemas the root re-exports for everything not split out.
- `src/*.test.ts` — unit tests for the pure, Zod-free logic (the normaliser's own table lives in
  `invite-domains.test.ts`); procedure-level behaviour is tested against the real server in
  `apps/api`.
