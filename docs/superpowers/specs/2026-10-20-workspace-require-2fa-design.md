# Enforced two-step verification per workspace — design (Phase 12 B)

Phase 12 "workspace admin depth": A workspace activity log (#112, merged) → **B enforced two-step
verification per workspace** → C email-domain allowlists for invitations. Approved in chat on
2026-10-20. One PR (it also ticks A in `docs/ROADMAP.md`).

## Intent

A workspace owner can require every member to have two-step verification. Decided with the
owner:
- **Enforcement:** block, never remove — a member without it stays a member but every workspace
  page and procedure refuses them until they set it up (the Slack / Google Workspace model).
- **What satisfies it:** the account has two-step verification on (TOTP) **or** at least one
  passkey — judged from the account's current state on every request, not from how this session
  signed in.
- **Who and where:** owner only, every plan (a security baseline, not an upsell); the owner must
  satisfy it themselves before turning it on.

## Basis (checked 2026-10-20)

- Context7 `/owasp/cheatsheetseries`: Zero Trust Architecture Cheat Sheet — "MFA for everyone",
  WebAuthn passkeys "most secure (highly phishing-resistant)", TOTP apps "good options"; MFA
  Cheat Sheet — "any MFA is better than no MFA", and resetting a lost factor must exist without
  becoming a bypass (here: recovery codes and the superadmin reset, unchanged).
- Legal Data Hunter: NIS2, Directive (EU) 2022/2555 Art. 21(1)–(2) — essential and important
  entities must take "appropriate and proportionate" risk-management measures; Art. 21(2)(j)
  names multi-factor authentication (the retrieved text was truncated before point (j); cited
  from the directive). A workspace that is such an entity needs a way to enforce MFA on its
  members.
- Legal Data Hunter (GDPRhub): Dutch DPA (AP) z2018-02009 (2018-07-31) — single-factor
  authentication (email + password) to a portal holding sensitive personal data was insufficient
  under the GDPR's security obligation (Art. 32): a workspace holding personal data has a concrete
  reason to require a second factor. Showing admins only a yes/no per member (never the factor,
  device or recovery state) keeps the members-list status proportionate (Art. 5(1)(c)).
- Context7 `/dinwwwh/orpc` (error handling): an error's `message` and `data` are sent to the
  client, so `data` carries only the reason code (`two_factor_required`, `owner_two_factor`) —
  never member names, counts or factor details; a middleware may throw for every procedure it
  wraps (the `member(min)` pattern), with contract-declared errors where the procedure declares
  them.
- Consensus: mandatory 2FA significantly reduced compromised bank accounts where optional 2FA did
  not (Kamar et al., Crime & Delinquency 2026); clear risk communication improves MFA uptake
  (Das et al., 2021) — hence the notice and mail that explain why and link straight to setup.

## 1. Data

- Migration `0030_workspace_require_two_factor`: `workspaces.require_two_factor` boolean, default
  false (SQLite integer 0/1, Postgres boolean — follow the repo's existing boolean pattern).
- `WorkspaceSummary` (`workspaces.list` / `get`) gains `requireTwoFactor: boolean`; `Me` / `User`
  gains `twoFactorSatisfied: boolean` (= `twoFactorEnabled || passkeys > 0`), computed where a
  `User` is built.

## 2. Enforcement

- One helper `satisfiesTwoFactor(user)` in `apps/api` (two-step on, or a passkey count > 0; read
  fresh per request).
- The router's `member(min)` middleware, after the membership/role checks: when the workspace
  requires it and the caller does not satisfy it → `FORBIDDEN` with `data: { reason:
  "two_factor_required" }` and `apiMessage(context, "workspaceTwoFactorRequired", { workspace })`
  ("Turn on two-step verification to access {workspace}." en + sv), declared on every procedure
  that uses `member`.
- **Exempt** (never blocked, so a blocked member can always fix it or leave): `workspaces.list`,
  `workspaces.leave`, `invitations.preview` / `accept` / `acceptById` (accepting is allowed; the
  workspace then blocks until set up), and every account-level procedure (`account.*`, `auth.*`).
- Impersonation follows the member: an impersonation session of a blocked member is blocked too
  (no support bypass).
- Realtime: `GET /events/workspaces/:id` answers `403` (body `two_factor_required`) under the same
  rule, re-checked every 60 s like membership; `createEventsRoute` passes `403` through; the
  client treats it as a permanent refusal (stop reconnecting, show the notice text).
- Not affected: `/v1` API keys and outgoing webhooks — machine credentials whose creation already
  needs an admin; documented.

## 3. Turning it on and off

- `workspaces.security.set({ workspaceId, requireTwoFactor })` (⚑, `member("owner")`, every plan,
  refused while impersonating `FORBIDDEN` "Not available while impersonating"). Turning it on
  when the owner does not satisfy it → `FORBIDDEN` `data.reason: "owner_two_factor"` ("Turn on
  two-step verification for your own account first."). A no-op (already that value) writes
  nothing.
- `workspaces.security.get({ workspaceId })` (`member("admin")`): `{ requireTwoFactor,
  membersWithoutTwoFactor: number }`.
- Each change: audited through `auditWorkspace` as `workspace.two_factor_requirement_changed`
  (`details: { enabled }`), added to `WORKSPACE_ACTIVITY_ACTIONS` and the Activity card's
  sentences (en + sv) and filter; the GDPR export allowlist gains its `enabled` key.
- Turning it on enqueues, in the same transaction, a `workspaceTwoFactorRequired` mail (new
  `@repo/email` template, en + sv, saved locale else English, test + story) to every member who
  does not satisfy it: the workspace name and a link to `${ACCOUNT_URL}/security`; never other
  members' names.

## 4. Members list

`workspaces.members.list` gains `twoFactor: boolean | null` per member — the boolean for an
admin-or-above caller, `null` below admin (same rule as members' emails). The account members list
shows a "No two-step" badge for admins.

## 5. UI

- `apps/account` Workspace page: a **Security** card (above API keys). Owner: a toggle form
  (checkbox + **Save**), turning it on goes through a confirmation step naming "N members will be
  blocked until they turn on two-step verification" (two-click, no JS required, like the existing
  two-step deletes); refused-for-owner message links to `/security`. Admin: read-only state and
  the count. Below admin: read-only state only.
- **Blocked notice** (`@repo/ui` block `TwoFactorRequiredNotice`, props only): shown by `apps/app`
  (`/notes`, `/chat`) and `apps/account` (`/workspace`, `/payments`) whenever the current workspace
  requires it and `me.user.twoFactorSatisfied` is false — instead of the page content — with
  **Set up two-step verification** (→ account `/security`), **Switch workspace** (the user menu's
  existing switcher, or a link to `${APP_URL}/workspaces/new` when this is the only one) and
  **Leave workspace** (the existing leave action). en + sv; the app layouts compute it server-side.
- `apps/account` Security page: when the account satisfies the requirement only through the
  factor being removed (turning two-step off, or removing the last passkey with two-step off) and
  at least one of its workspaces requires it, the form shows a warning naming those workspaces
  before the action (still allowed).
- Invitation landing page (`apps/app` `/invitations/[token]`): `invitations.preview` gains
  `requireTwoFactor`; the page says "This workspace requires two-step verification." when true.

## 6. Testing, docs

- api tests on SQLite and Postgres: blocked on every `member`-scoped procedure family (notes,
  members, invitations, api keys, webhooks, activity, billing, logo), exempt procedures pass; a
  passkey alone satisfies; disabling two-step re-blocks on the next request; owner self-lockout
  refusal; owner-only + impersonation refusal; no-op writes nothing; audit row + mail to exactly
  the non-satisfying members; members list `twoFactor` null below admin; realtime 403 and the
  60 s recheck; `/v1` unaffected.
- Action cores, the i18n guard, `@repo/email` template test + story, the notice block's story.
- e2e: an owner turns the requirement on → a member without two-step sees the notice on `/notes`,
  sets up two-step on account `/security`, then sees `/notes`; the activity card shows the change.
- Docs: CLAUDE.md (a **Required two-step.** paragraph; migration; Activity log and Two-factor
  cross-refs; e2e counts), `apps/api`, `apps/account`, `apps/app`, `packages/email` READMEs,
  `docs/guides/` (a short section in the two-factor or workspaces guide), `/privacy` (admins see
  whether members have two-step on), ROADMAP (A ticked now; B ticked on merge).

## Out of scope

A grace period; requiring a *phishing-resistant* factor only; per-session step-up; enforcing on
`/v1` keys; SSO.
