# Transactional email and soft email verification (Phase 6a)

**Status:** implemented (Phase 6a)
**Date:** 2026-10-01
**Origin:** `docs/superpowers/research/2026-10-01-boilerplate-benchmark.md`, Phase 6 — "the
week-one layer", sub-project 6a

## Intent

`apps/api` has an email seam (`Mailer`) with one implementation that writes to the log, one
caller (password reset) and a text-only message shape. No user has a verified email. This phase
makes email real without choosing a vendor for the owner: three adapters behind the seam, React
Email templates in a shared package previewed in Storybook, and *soft* email verification —
sign-up sends a verify link, the account shows the state, nothing is gated yet. 6b (magic link,
OAuth) and 6e (invitations) add templates and token purposes to what this phase builds.

**Success criteria**

- `MAIL_PROVIDER=log | smtp | resend` selects the adapter at boot; the repo still runs keyless
  with `log`; Compose ships a real inbox (Mailpit).
- Three templates — verify email, reset password, password changed — render to HTML and plain
  text from `@repo/email`, are tested, and appear in Storybook.
- Sign-up sends a verify link; clicking it sets `email_verified_at`; `account` shows
  Verified/Unverified with a rate-limited resend; `auth` has `/verify-email`.
- Password reset and password change send the new templates.
- One-time tokens live in one `tokens` table with a `purpose`, replacing `password_resets`.
- Nothing in `apps/app` changes; no sign-in is blocked by verification.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Verification strength | Soft: link sent, state shown, nothing gated | Minimal product risk; schema and procedures ready for a later hard gate or per-feature requirement |
| Providers | `log`, `smtp` (Nodemailer v10), `resend` (plain `fetch`) | SMTP covers every provider and Mailpit; Resend is the field's default and needs no SDK; Bun's native `Bun.SMTPClient` is not in Bun 1.4 yet |
| Templates | React Email in `packages/email`, rendered with `@react-email/render` | Provider-agnostic HTML + text; `render()` runs on Bun via `react-dom/server`; buyers expect it |
| Preview | Storybook iframes, no React Email preview server | The review surface already exists; one less process |
| Emails in 6a | Verify (doubles as welcome), reset, password-changed | One mail at sign-up; a security notice is cheap and expected |
| Tokens | One `tokens` table with `purpose`, migrated from `password_resets` | The second copy of the pattern is when it becomes the pattern; 6b/6e reuse it |
| Resend limiter | Per user, 3 / 15 min, returns `TOO_MANY_REQUESTS` | Caller is authenticated, so nothing to hide (unlike the silent reset limiter) |
| Brand name in mail | A `brand` prop defaulting to `"Boilerplate"` | `Brand` from `packages/ui` is DOM React and cannot render in email HTML; the duplication is deliberate and documented |
| Send path | Fire-and-forget with `.catch(log)` plus a success log line | A slow provider must not change response timing or status |

## Components

### `packages/email` (`@repo/email`)

- `src/templates/layout.tsx` — shared shell (brand name, footer line). `src/templates/verify-email.tsx`
  (`{ name?: string; link: string; brand?: string }`), `reset-password.tsx` (same props),
  `password-changed.tsx` (`{ name?: string; at: string; accountUrl: string; brand?: string }`).
- `src/index.ts` — `type RenderedEmail = { subject: string; html: string; text: string }` and
  `emails = { verifyEmail(props), resetPassword(props), passwordChanged(props) }`, each
  `Promise<RenderedEmail>` via `render()` and `render(…, { plainText: true })`. No env, no provider.
- Dependencies via catalog: `react`, `react-dom`, `@react-email/components`, `@react-email/render`.
  Preset `@repo/typescript-config/bun.json`.
- Tests: each template renders; html and text contain the link / name / timestamp; subjects are
  "Verify your email", "Reset your password", "Your password was changed"; text has no tags.
- Stories: `apps/story/stories/email/{VerifyEmail,ResetPassword,PasswordChanged}.stories.tsx`
  with an `EmailPreview` helper rendering `html` into `<iframe srcdoc title="Email preview">`;
  `play` asserts the iframe document contains the link. `apps/story` depends on `@repo/email`.

### `apps/api/src/mail/`

- `mailer.ts` — `Message = { to: string; subject: string; html: string; text: string; idempotencyKey?: string }`,
  `Mailer = { send(message: Message): Promise<void> }`. Replaces `src/mailer.ts`.
- `log.ts` — `logMailer(log?)`: prints `[api] mail to <to> — <subject>` and the text.
- `smtp.ts` — `smtpMailer({ url, from })` on Nodemailer v10 `createTransport(url)`;
  `smtp://host:587` STARTTLS, `smtps://host:465` TLS.
- `resend.ts` — `resendMailer({ apiKey, from, fetch? })`: `POST https://api.resend.com/emails`
  with `{ from, to, subject, html, text }`, `Authorization: Bearer`, `Idempotency-Key` when given,
  10 s `AbortSignal.timeout`; non-2xx throws `Error("resend <status>: <first 200 chars>")`.
- `create-mailer.ts` — `createMailer(env)`: by `MAIL_PROVIDER`; `smtp` needs `SMTP_URL`, `resend`
  needs `RESEND_API_KEY`, both need `MAIL_FROM`.
- Every send site: `void mailer.send(m).then(() => log("mail sent <template> to <masked>")).catch((e) => log("<template> mail failed", e))`.
  Masking: first character + `***@` + domain.
- `test-server.ts` keeps injecting a recording mailer (`messages: Message[]`).

### Env (`apps/api/src/env.ts`)

| Var | Default | Rule |
|---|---|---|
| `MAIL_PROVIDER` | `log` | enum; production + `log` → boot warning (existing) |
| `MAIL_FROM` | `Boilerplate <no-reply@brand.localhost>` | required when provider ≠ `log` (the default is dev-only: production with `smtp`/`resend` must set it) |
| `SMTP_URL` | — | required iff `smtp` |
| `RESEND_API_KEY` | — | required iff `resend` |
| `ACCOUNT_URL` | `siteUrl("account", {})` outside production | required in production, like `AUTH_URL`; `apps/api` adds `@repo/sites` |

Violations throw in `loadEnv` (process exits at startup, matching `AUTH_URL`).

### Schema — migration `0004_email_verification`

- `ALTER TABLE users ADD COLUMN email_verified_at TEXT NULL`.
- `CREATE TABLE tokens (id, user_id INTEGER NOT NULL, purpose TEXT NOT NULL CHECK (purpose IN ('password_reset','email_verify')), token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, consumed_at TEXT NULL, created_at TEXT NOT NULL)`
  with an index on `(user_id, purpose)`. `user_id` carries no `REFERENCES users`: the repo uses no
  foreign keys anywhere (SQLite enforces them only with `PRAGMA foreign_keys = ON`, and `sessions` /
  `password_resets` in `0002_auth` never had one), so any cascade on user deletion is
  application-level.
- `INSERT INTO tokens SELECT …, 'password_reset', … FROM password_resets`; `DROP TABLE password_resets`.
- `queries/password-resets.ts` → `queries/tokens.ts`: `create({ userId, purpose, tokenHash, expiresAt })`,
  `consume(tokenHash, purpose, at)`, `invalidateForUser(userId, purpose, at)`, `deleteStale(at)`.
  Later purposes (`magic_link`, `invite`) extend the CHECK in their own migration.

### Contract and procedures

- `UserSchema` gains `emailVerified: boolean` (from `email_verified_at IS NOT NULL`).
- `auth.signUp` — unchanged input/output; after user + session, create an `email_verify` token
  (TTL 24 h), send `verifyEmail` with `${AUTH_URL}/verify-email?token=<token>`.
- `auth.verifyEmail({ token })` — public; `consume(hash, 'email_verify', now)`; unknown / expired /
  used → `BAD_REQUEST`; on success set `email_verified_at = now` and `invalidateForUser(userId, 'email_verify', now)`.
- `account.resendVerification()` — session required, no input; already verified → returns
  `{ sent: false }`; limiter `verify:<userId>` 3 / 15 min → `TOO_MANY_REQUESTS`; otherwise
  invalidate older `email_verify` tokens, issue a new one, send, return `{ sent: true }`.
- `auth.requestPasswordReset` — uses `tokens` with purpose `password_reset` and the
  `resetPassword` template; behaviour (silent limiter, timing) unchanged.
- `auth.resetPassword` and `account.changePassword` — on success send `passwordChanged`
  (`at` = now ISO, `accountUrl` = `${ACCOUNT_URL}/security`).
- Rule for the future: an email change resets `email_verified_at` and sends a new verify link.

### `apps/auth`

- `/verify-email?token=…` — server page in `AuthLayout`; without a plausible token (missing, or not
  exactly 43 base64url characters — 32 bytes, the shape `newToken()` produces) renders the failure state without calling the api; otherwise calls
  `anonymousApi({ ip }).auth.verifyEmail` and renders *Email verified* (button to `APP_URL`, or
  "Sign in" when no session) or *This link has expired or was already used* ("Sign in and request
  a new one" → `/login?next=${siteUrl("account")}/personal-info`). The call is made once per
  request; a refresh of a used link shows the failure state, which is correct.
- `apps/auth` reads `siteUrl("account")` from `@repo/sites` (already a dependency).

### `apps/account`

- `VerifyEmailNotice` component (unverified only): copy + **Resend verification email** button
  (server action → `account.resendVerification`), `FormMessage` for "Sent — check your inbox" /
  "Too many requests — try again in a few minutes" / generic failure. Rendered on the home view
  and above the email field on personal-info.
- Personal-info shows the email with a `Verified` / `Unverified` badge.
- `@repo/session` `User` type gains `emailVerified`.

### Operations

- `docker-compose.yml`: `mailpit` service (`axllent/mailpit`, ports `8025:8025`, internal 1025),
  api env `MAIL_PROVIDER=smtp`, `SMTP_URL=smtp://mailpit:1025`, `MAIL_FROM` default. `docker-compose.dev.yml`:
  same service; api stays `log` unless the vars are set. `.devcontainer` forwards 8025.
- Dockerfiles unchanged (`COPY --parents` picks up the new workspace).
- CI: `@repo/email` in root `typecheck` and `test:services`; planner tests updated; `api-postgres`
  job runs the migration; Storybook shards include the email stories.

## Docs

CLAUDE.md: an **Email** paragraph under Authentication (seam, providers, env table rows, where
templates live, "a new email = template + test + story"); `packages/email/README.md`;
`apps/api/README.md` (env, `tokens`, new procedures); `apps/auth` and `apps/account` READMEs;
ROADMAP: a Phase 6 section listing 6a (ticked on merge) and 6b–6f as proposed by the benchmark,
6d–6f marked "pending owner decision".

## Tests

- `@repo/email`: render tests per template.
- `apps/api`: adapters — resend with a fake `fetch` (headers, body, idempotency key, non-2xx
  throws, timeout); smtp with Nodemailer's `jsonTransport` (no network); `createMailer` env
  matrix. Procedures on SQLite and Postgres: sign-up produces one verify message whose link
  verifies; `verifyEmail` flips `me().emailVerified`, rejects reuse and expiry; `resendVerification`
  no-ops when verified, invalidates the previous token, 4th call → `TOO_MANY_REQUESTS`; reset and
  change-password each produce a `passwordChanged` message; migration moves an open reset row
  into `tokens` and `password_resets` is gone; `loadEnv` rejects `smtp` without `SMTP_URL`,
  `resend` without `RESEND_API_KEY`, production without `ACCOUNT_URL`.
- `apps/auth` / `apps/account`: action-core tests for the new action and the verify page's
  token plausibility check.
- Storybook: three stories with `play`.
- Browser pass (`bun dev`): sign up → account shows Unverified + notice → open the link from the
  api log → *Email verified* → account shows Verified; resend ×4 → limit message; reset flow
  end to end; Compose: one real send lands in Mailpit at `localhost:8025`.

## Out of scope

Email change, hard gating, bounce/complaint webhooks, marketing or newsletter mail, per-user mail
preferences, `Bun.SMTPClient` (revisit when released), Postmark/SES HTTP adapters (SMTP covers them).
