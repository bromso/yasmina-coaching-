# Transactional Email and Soft Verification (Phase 6a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real email behind `apps/api`'s `Mailer` seam (log / SMTP / Resend), React Email templates in a shared package previewed in Storybook, and soft email verification on sign-up with a rate-limited resend from the account app.

**Architecture:** A new workspace `packages/email` renders three templates to `{ subject, html, text }` and knows nothing about providers. `apps/api/src/mail/` holds the adapters and `createMailer(env)`. A `tokens` table with a `purpose` column replaces `password_resets` and carries both reset and verification tokens. `apps/auth` gains `/verify-email`; `apps/account` shows the verification state and a resend button. Nothing gates on verification.

**Tech Stack:** Bun 1.3+, oRPC, `Bun.sql` (SQLite + Postgres), React 19 + `@react-email/components` 1.x + `@react-email/render` 2.x, Nodemailer 10, Next 16, Storybook 10 (vitest browser), Biome.

**Spec:** `docs/superpowers/specs/2026-10-01-transactional-email-design.md`

## Global Constraints

- Biome: 0 errors and 0 warnings; double quotes, no semicolons, 2-space, 100 cols. Run `bunx biome check --write <paths>` before each commit.
- Commit trailer, the only attribution line: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Subjects ≤ 100 chars (commitlint).
- Shared deps go in the root `catalog`; workspaces reference `"catalog:"`. New catalog entries: `@react-email/components` `^1.0.12`, `@react-email/render` `^2.1.0`, `nodemailer` `^10.0.13`, `@types/nodemailer` `^8.0.2`.
- Tokens: 32 bytes base64url from `newToken()` (43 characters), SHA-256 via `tokenHash()`; never logged.
- Mail is fire-and-forget at every send site: `void mailer.send(m).then(…).catch(…)`; a slow or failing provider never changes a response's status or timing.
- Timestamps are ISO strings (`new Date().toISOString()`), as everywhere in `apps/api`.
- Migrations are forward-only; `0004_email_verification` is a new file listed in `migrations/index.ts`; never edit `0001`–`0003`.
- Subjects: "Verify your email", "Reset your password", "Your password was changed". Default brand name `"Boilerplate"`.
- Env rules (apps/api `loadEnv`): `MAIL_PROVIDER` ∈ `log | smtp | resend` (default `log`); `MAIL_FROM` default `Boilerplate <no-reply@brand.localhost>`, required when provider ≠ `log`; `SMTP_URL` required iff `smtp`; `RESEND_API_KEY` required iff `resend`; `ACCOUNT_URL` default `siteUrl("account", {})`, required in production. Violations throw in `loadEnv`.
- Verification token TTL 24 h; resend limiter 3 per 15 min per user → `TOO_MANY_REQUESTS`.
- Links: verify `${AUTH_URL}/verify-email?token=…`; password-changed `${ACCOUNT_URL}/security`.
- `apps/app` is not modified.

## Review Focus

1. A failing or hanging provider must not change sign-up's result: with a mailer whose `send` rejects, `auth.signUp` still returns 201 and the user is created — test in Task 5.
2. A `password_reset` token presented to `auth.verifyEmail` (or an `email_verify` token to `auth.resetPassword`) must fail: purposes never cross — test in Task 4 (query level) and Task 5 (procedure level).
3. A user's name is rendered into HTML email: `<script>` in a name must appear escaped, never as markup — test in Task 1.
4. The verify page receives a token of the right shape that the api does not know: the page shows the failure state and never throws — test in Task 6.
5. The resend limiter is per user, not global: three resends by user A must not block user B — test in Task 5.

---

### Task 1: `@repo/email` — templates, render, tests, workspace wiring

**Files:**
- Create: `packages/email/package.json`, `packages/email/tsconfig.json`, `packages/email/README.md`
- Create: `packages/email/src/templates/layout.tsx`, `verify-email.tsx`, `reset-password.tsx`, `password-changed.tsx`
- Create: `packages/email/src/index.tsx`, `packages/email/src/index.test.tsx`
- Modify: root `package.json` (catalog, `typecheck`, `test:services`), `scripts/ci-plan.test.ts`

**Interfaces:**
- Produces: `emails.verifyEmail({ name?, link, brand? })`, `emails.resetPassword({ name?, link, brand? })`, `emails.passwordChanged({ name?, at, accountUrl, brand? })` — each `Promise<RenderedEmail>`; `type RenderedEmail = { subject: string; html: string; text: string }`; the template components `VerifyEmail`, `ResetPassword`, `PasswordChanged` and `BRAND` default for stories.

- [ ] **Step 1: Catalog entries and workspace scaffold**

Root `package.json` `catalog`: add
```json
"@react-email/components": "^1.0.12",
"@react-email/render": "^2.1.0",
"nodemailer": "^10.0.13",
"@types/nodemailer": "^8.0.2"
```

`packages/email/package.json`:
```json
{
  "name": "@repo/email",
  "version": "0.1.0",
  "description": "Transactional email templates rendered to HTML and text; no provider knowledge",
  "type": "module",
  "private": true,
  "exports": {
    ".": "./src/index.tsx",
    "./templates/*": "./src/templates/*.tsx"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@react-email/components": "catalog:",
    "@react-email/render": "catalog:",
    "react": "catalog:",
    "react-dom": "catalog:"
  },
  "devDependencies": {
    "@repo/typescript-config": "workspace:*",
    "@types/bun": "catalog:",
    "@types/react": "catalog:"
  }
}
```
`packages/email/tsconfig.json`:
```json
{
  "extends": "@repo/typescript-config/react-library.json",
  "compilerOptions": { "types": ["bun"], "module": "Preserve", "moduleResolution": "Bundler", "noEmit": true },
  "include": ["src"]
}
```

Run `bun install`.

- [ ] **Step 2: Write the failing tests**

`packages/email/src/index.test.tsx`:
```tsx
import { describe, expect, test } from "bun:test"
import { emails } from "./index"

const link = "https://auth.example.com/verify-email?token=abc"

describe("verifyEmail", () => {
  test("renders subject, html and text containing the link", async () => {
    const mail = await emails.verifyEmail({ name: "Ada", link })
    expect(mail.subject).toBe("Verify your email")
    expect(mail.html).toContain(link)
    expect(mail.html).toContain("Ada")
    expect(mail.text).toContain(link)
    expect(mail.text).not.toMatch(/<[a-z][\s\S]*>/i)
  })

  test("escapes HTML in the name", async () => {
    const mail = await emails.verifyEmail({ name: "<script>alert(1)</script>", link })
    expect(mail.html).not.toContain("<script>")
    expect(mail.html).toContain("&lt;script&gt;")
  })

  test("uses the brand name in the footer", async () => {
    const mail = await emails.verifyEmail({ link, brand: "Acme" })
    expect(mail.html).toContain("Acme")
    expect(mail.text).toContain("Acme")
  })
})

describe("resetPassword", () => {
  test("renders the one-hour notice and the link", async () => {
    const mail = await emails.resetPassword({ link })
    expect(mail.subject).toBe("Reset your password")
    expect(mail.html).toContain(link)
    expect(mail.text).toMatch(/within an hour/i)
  })
})

describe("passwordChanged", () => {
  test("renders the time and the account link", async () => {
    const mail = await emails.passwordChanged({
      name: "Ada",
      at: "2026-10-01T18:00:00.000Z",
      accountUrl: "https://account.example.com/security",
    })
    expect(mail.subject).toBe("Your password was changed")
    expect(mail.html).toContain("https://account.example.com/security")
    expect(mail.text).toContain("2026-10-01")
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun test packages/email`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 4: Templates and the render index**

`packages/email/src/templates/layout.tsx`:
```tsx
import { Body, Container, Head, Html, Preview, Section, Text } from "@react-email/components"
import type { ReactNode } from "react"

export const BRAND = "Boilerplate"

const body = { backgroundColor: "#f6f6f6", fontFamily: "ui-sans-serif, system-ui, sans-serif" }
const card = { backgroundColor: "#ffffff", borderRadius: 8, margin: "24px auto", padding: 24, maxWidth: 480 }
const footer = { color: "#6b7280", fontSize: 12 }

/** The shell every mail shares: preview line, white card, brand footer. */
export function Layout({
  preview,
  brand = BRAND,
  children,
}: {
  preview: string
  brand?: string
  children: ReactNode
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={card}>
          <Section>{children}</Section>
          <Text style={footer}>{brand} · This email was sent to you because of your account.</Text>
        </Container>
      </Body>
    </Html>
  )
}

export const greeting = (name?: string) => (name ? `Hi ${name},` : "Hi,")
```

`packages/email/src/templates/verify-email.tsx`:
```tsx
import { Button, Heading, Link, Text } from "@react-email/components"
import { greeting, Layout } from "./layout"

export type VerifyEmailProps = { name?: string; link: string; brand?: string }

export const verifyEmailSubject = "Verify your email"

export function VerifyEmail({ name, link, brand }: VerifyEmailProps) {
  return (
    <Layout preview="Confirm your email address to finish setting up your account" brand={brand}>
      <Heading as="h1">Welcome{name ? `, ${name}` : ""}</Heading>
      <Text>{greeting(name)}</Text>
      <Text>Confirm this is your email address. The link works for 24 hours.</Text>
      <Button href={link} style={{ background: "#111827", color: "#fff", padding: "10px 16px", borderRadius: 6 }}>
        Verify email
      </Button>
      <Text>
        Or open this link: <Link href={link}>{link}</Link>
      </Text>
      <Text>If you did not create an account, ignore this email.</Text>
    </Layout>
  )
}
```

`packages/email/src/templates/reset-password.tsx`:
```tsx
import { Button, Heading, Link, Text } from "@react-email/components"
import { greeting, Layout } from "./layout"

export type ResetPasswordProps = { name?: string; link: string; brand?: string }

export const resetPasswordSubject = "Reset your password"

export function ResetPassword({ name, link, brand }: ResetPasswordProps) {
  return (
    <Layout preview="Choose a new password" brand={brand}>
      <Heading as="h1">Reset your password</Heading>
      <Text>{greeting(name)}</Text>
      <Text>Use this link within an hour to choose a new password.</Text>
      <Button href={link} style={{ background: "#111827", color: "#fff", padding: "10px 16px", borderRadius: 6 }}>
        Choose a new password
      </Button>
      <Text>
        Or open this link: <Link href={link}>{link}</Link>
      </Text>
      <Text>If you did not ask for this, ignore this email — your password stays as it is.</Text>
    </Layout>
  )
}
```

`packages/email/src/templates/password-changed.tsx`:
```tsx
import { Heading, Link, Text } from "@react-email/components"
import { greeting, Layout } from "./layout"

export type PasswordChangedProps = { name?: string; at: string; accountUrl: string; brand?: string }

export const passwordChangedSubject = "Your password was changed"

export function PasswordChanged({ name, at, accountUrl, brand }: PasswordChangedProps) {
  return (
    <Layout preview="Your password was changed" brand={brand}>
      <Heading as="h1">Your password was changed</Heading>
      <Text>{greeting(name)}</Text>
      <Text>The password for your account was changed at {at} (UTC).</Text>
      <Text>
        If this was you, nothing else to do. If it was not, reset your password now and review
        your signed-in devices at <Link href={accountUrl}>{accountUrl}</Link>.
      </Text>
    </Layout>
  )
}
```

`packages/email/src/index.tsx`:
```tsx
import { render } from "@react-email/render"
import type { ReactElement } from "react"
import { PasswordChanged, type PasswordChangedProps, passwordChangedSubject } from "./templates/password-changed"
import { ResetPassword, type ResetPasswordProps, resetPasswordSubject } from "./templates/reset-password"
import { VerifyEmail, type VerifyEmailProps, verifyEmailSubject } from "./templates/verify-email"

export type RenderedEmail = { subject: string; html: string; text: string }

async function rendered(subject: string, element: ReactElement): Promise<RenderedEmail> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })])
  return { subject, html, text }
}

/** Every transactional email, rendered. Providers live in apps/api; this package only renders. */
export const emails = {
  verifyEmail: (props: VerifyEmailProps) => rendered(verifyEmailSubject, <VerifyEmail {...props} />),
  resetPassword: (props: ResetPasswordProps) =>
    rendered(resetPasswordSubject, <ResetPassword {...props} />),
  passwordChanged: (props: PasswordChangedProps) =>
    rendered(passwordChangedSubject, <PasswordChanged {...props} />),
}

export { BRAND } from "./templates/layout"
export { PasswordChanged, type PasswordChangedProps } from "./templates/password-changed"
export { ResetPassword, type ResetPasswordProps } from "./templates/reset-password"
export { VerifyEmail, type VerifyEmailProps } from "./templates/verify-email"
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `bun test packages/email`
Expected: 5 pass. If `@react-email/render`'s plain-text output includes the preview text, adjust nothing — the assertions only check link, name, brand, and no tags.

- [ ] **Step 6: Root scripts, planner tests, README**

Root `package.json`: add `--filter @repo/email` to both `typecheck` (after `@repo/sites`) and `test:services` (after `@repo/sites`).

`scripts/ci-plan.test.ts`: the planner tests pin the root `typecheck` / `test:services` filter lists — run `bun test scripts`, and update whichever test enumerates them so it includes `@repo/email`. The dependency-graph test for `@repo/email` is added in Task 3 (nothing depends on the package until then).

`packages/email/README.md`: what the package is, the three templates and their props, `emails.*` returning `{ subject, html, text }`, "a new email = template + test + story", the brand-name note (`Brand` from `packages/ui` cannot render in email HTML, so `brand` is a prop defaulting to `"Boilerplate"`).

- [ ] **Step 7: Verify and commit**

Run: `bunx biome check --write packages/email scripts package.json && bun run --filter @repo/email typecheck && bun test packages/email && bun test scripts`
Expected: clean, 5 pass, 25 pass.

```bash
git add packages/email package.json bun.lock scripts/ci-plan.test.ts
git commit -m "feat(email): @repo/email renders verify, reset and password-changed templates"
```

---

### Task 2: Storybook previews for the three templates

**Files:**
- Create: `apps/story/stories/email/EmailPreview.tsx`, `apps/story/stories/email/VerifyEmail.stories.tsx`, `ResetPassword.stories.tsx`, `PasswordChanged.stories.tsx`
- Modify: `apps/story/package.json` (`"@repo/email": "workspace:*"`)

**Interfaces:**
- Consumes: `emails.*` from Task 1.

- [ ] **Step 1: Dependency**

Add `"@repo/email": "workspace:*"` to `apps/story/package.json` dependencies; `bun install`.

- [ ] **Step 2: Preview helper**

`apps/story/stories/email/EmailPreview.tsx`:
```tsx
import type { RenderedEmail } from "@repo/email"
import { useEffect, useState } from "react"

/** Renders a template's HTML in a sandboxed iframe, with the subject and plain text beside it. */
export function EmailPreview({ render }: { render: () => Promise<RenderedEmail> }) {
  const [mail, setMail] = useState<RenderedEmail | null>(null)
  useEffect(() => {
    let live = true
    render().then((m) => live && setMail(m))
    return () => {
      live = false
    }
  }, [render])
  if (!mail) return <p>Rendering…</p>
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 720 }}>
      <p>
        <strong>Subject:</strong> <span data-testid="subject">{mail.subject}</span>
      </p>
      <iframe title="Email preview" srcDoc={mail.html} sandbox="" style={{ width: "100%", height: 560, border: "1px solid #e5e7eb" }} />
      <details>
        <summary>Plain text</summary>
        <pre data-testid="text" style={{ whiteSpace: "pre-wrap" }}>{mail.text}</pre>
      </details>
    </div>
  )
}
```

- [ ] **Step 3: Stories**

`apps/story/stories/email/VerifyEmail.stories.tsx`:
```tsx
import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const link = "https://auth.brand.com/verify-email?token=example"

const meta = {
  title: "Email/VerifyEmail",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.verifyEmail({ name: "Ada Lovelace", link }) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByTestId("subject")).toHaveTextContent("Verify your email"))
    await expect(canvas.getByTestId("text")).toHaveTextContent(link)
  },
}

export const WithoutName: Story = { args: { render: () => emails.verifyEmail({ link }) } }
```

`ResetPassword.stories.tsx` and `PasswordChanged.stories.tsx` follow the same shape: titles `Email/ResetPassword` (subject "Reset your password", link `https://auth.brand.com/reset-password?token=example`) and `Email/PasswordChanged` (subject "Your password was changed", args `{ name: "Ada Lovelace", at: "2026-10-01T18:00:00.000Z", accountUrl: "https://account.brand.com/security" }`, play asserts the text contains the account URL).

- [ ] **Step 4: Run the three stories' tests**

Run: `cd apps/story && bunx vitest run --project=storybook stories/email` (read `apps/story/package.json` `test` script for the exact invocation; Playwright chromium is installed in the user cache).
Expected: 4 stories pass (Default ×3, WithoutName).

- [ ] **Step 5: Commit**

```bash
bunx biome check --write apps/story/stories/email
git add apps/story
git commit -m "feat(story): email template previews rendered in sandboxed iframes"
```

---

### Task 3: Mail adapters, `createMailer`, env, and the reset mail on the new template

**Files:**
- Create: `apps/api/src/mail/mailer.ts`, `log.ts`, `smtp.ts`, `resend.ts`, `create-mailer.ts`, `mail.test.ts`
- Delete: `apps/api/src/mailer.ts`
- Modify: `apps/api/src/env.ts`, `env.test.ts`, `index.ts`, `server.ts`, `router.ts` (reset send only), `test-server.ts`, `apps/api/package.json`, `apps/api/.env.example`, `scripts/ci-plan.test.ts`

**Interfaces:**
- Produces: `Message = { to; subject; html; text; idempotencyKey? }`, `Mailer`, `createMailer(env: Pick<Env, "MAIL_PROVIDER" | "MAIL_FROM" | "SMTP_URL" | "RESEND_API_KEY">)`, `maskEmail(email)`; `Context.accountUrl: string`; `ServerOptions.accountUrl: string`.

- [ ] **Step 1: Dependencies**

`apps/api/package.json`: dependencies `+ "@repo/email": "workspace:*"`, `"@repo/sites": "workspace:*"`, `"nodemailer": "catalog:"`; devDependencies `+ "@types/nodemailer": "catalog:"`. `bun install`.

- [ ] **Step 2: Failing tests — adapters and env**

`apps/api/src/mail/mail.test.ts`:
```ts
import { describe, expect, test } from "bun:test"
import { createMailer } from "./create-mailer"
import { maskEmail } from "./mailer"
import { resendMailer } from "./resend"
import { smtpMailer } from "./smtp"

const message = { to: "ada@example.com", subject: "Hi", html: "<p>Hi</p>", text: "Hi" }

describe("resendMailer", () => {
  test("posts the message with the bearer token and idempotency key", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const fetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return new Response(JSON.stringify({ id: "m_1" }), { status: 200 })
    }
    const mailer = resendMailer({ apiKey: "re_test", from: "Boilerplate <no-reply@x.test>", fetch })
    await mailer.send({ ...message, idempotencyKey: "verify:1:abc" })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe("https://api.resend.com/emails")
    const headers = new Headers(calls[0]?.init.headers)
    expect(headers.get("authorization")).toBe("Bearer re_test")
    expect(headers.get("idempotency-key")).toBe("verify:1:abc")
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      from: "Boilerplate <no-reply@x.test>",
      to: "ada@example.com",
      subject: "Hi",
      html: "<p>Hi</p>",
      text: "Hi",
    })
  })

  test("a non-2xx response throws with the status and body", async () => {
    const fetch = async () => new Response('{"message":"invalid"}', { status: 422 })
    const mailer = resendMailer({ apiKey: "re_test", from: "a@x.test", fetch })
    await expect(mailer.send(message)).rejects.toThrow(/resend 422: .*invalid/)
  })
})

describe("smtpMailer", () => {
  test("hands the message to the transport with the configured sender", async () => {
    const mailer = smtpMailer({ url: "smtp://user:pass@localhost:2525", from: "a@x.test", jsonTransport: true })
    const info = await mailer.sendRaw(message)
    const parsed = JSON.parse(info.message as string)
    expect(parsed.from.address).toBe("a@x.test")
    expect(parsed.to[0].address).toBe("ada@example.com")
    expect(parsed.html).toBe("<p>Hi</p>")
  })
})

describe("createMailer", () => {
  test("log is the default", () => {
    expect(createMailer({ MAIL_PROVIDER: "log", MAIL_FROM: "a@x.test" }).kind).toBe("log")
  })
  test("smtp needs SMTP_URL", () => {
    expect(() => createMailer({ MAIL_PROVIDER: "smtp", MAIL_FROM: "a@x.test" })).toThrow(/SMTP_URL/)
    expect(createMailer({ MAIL_PROVIDER: "smtp", MAIL_FROM: "a@x.test", SMTP_URL: "smtp://h:25" }).kind).toBe("smtp")
  })
  test("resend needs RESEND_API_KEY", () => {
    expect(() => createMailer({ MAIL_PROVIDER: "resend", MAIL_FROM: "a@x.test" })).toThrow(/RESEND_API_KEY/)
  })
})

test("maskEmail keeps the first character and the domain", () => {
  expect(maskEmail("ada@example.com")).toBe("a***@example.com")
  expect(maskEmail("x")).toBe("***")
})
```

`apps/api/src/env.test.ts` — add (match the file's existing style; it has a `base` env helper or similar — read it):
```ts
  test("MAIL_PROVIDER defaults to log with a dev MAIL_FROM", () => {
    const env = loadEnv({ ...base, NODE_ENV: "development" })
    expect(env.MAIL_PROVIDER).toBe("log")
    expect(env.MAIL_FROM).toBe("Boilerplate <no-reply@brand.localhost>")
  })
  test("smtp without SMTP_URL and resend without RESEND_API_KEY are rejected", () => {
    expect(() => loadEnv({ ...base, MAIL_PROVIDER: "smtp" })).toThrow(/SMTP_URL/)
    expect(() => loadEnv({ ...base, MAIL_PROVIDER: "resend" })).toThrow(/RESEND_API_KEY/)
  })
  test("a non-log provider without MAIL_FROM is rejected in production", () => {
    expect(() =>
      loadEnv({ ...base, NODE_ENV: "production", AUTH_URL: "https://auth.x", ACCOUNT_URL: "https://account.x", MAIL_PROVIDER: "resend", RESEND_API_KEY: "k", MAIL_FROM: "" })
    ).toThrow(/MAIL_FROM/)
  })
  test("ACCOUNT_URL is required in production and defaults in development", () => {
    expect(() => loadEnv({ ...base, NODE_ENV: "production", AUTH_URL: "https://auth.x" })).toThrow(/ACCOUNT_URL/)
    expect(loadEnv({ ...base, NODE_ENV: "development" }).ACCOUNT_URL).toBe("http://account.brand.localhost:3003")
  })
```

- [ ] **Step 3: Run to verify they fail**

Run: `bun test apps/api/src/mail apps/api/src/env.test.ts`
Expected: FAIL — modules missing / env keys unknown.

- [ ] **Step 4: Implement the mail module**

`apps/api/src/mail/mailer.ts`:
```ts
export type Message = {
  to: string
  subject: string
  html: string
  text: string
  /** Lets a provider drop a retried duplicate (Resend honours it; SMTP ignores it). */
  idempotencyKey?: string
}

/** The seam for email. Adapters implement `send`; the default writes to the log. */
export type Mailer = { kind: "log" | "smtp" | "resend"; send(message: Message): Promise<void> }

/** `ada@example.com` → `a***@example.com`; for log lines, never for the message itself. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@")
  if (at < 1) return "***"
  return `${email[0]}***${email.slice(at)}`
}
```

`apps/api/src/mail/log.ts`:
```ts
import type { Mailer } from "./mailer"

export function logMailer(log: (message: string) => void = console.info): Mailer {
  return {
    kind: "log",
    async send({ to, subject, text }) {
      log(`[api] mail to ${to} — ${subject}\n${text}`)
    },
  }
}
```

`apps/api/src/mail/resend.ts`:
```ts
import type { Mailer, Message } from "./mailer"

type Options = { apiKey: string; from: string; fetch?: typeof globalThis.fetch; timeoutMs?: number }

/** Resend's HTTP API: one POST per message. No SDK — the endpoint is a single JSON call. */
export function resendMailer({ apiKey, from, fetch = globalThis.fetch, timeoutMs = 10_000 }: Options): Mailer {
  return {
    kind: "resend",
    async send(message: Message) {
      const headers: Record<string, string> = {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      }
      if (message.idempotencyKey) headers["idempotency-key"] = message.idempotencyKey
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers,
        body: JSON.stringify({
          from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) {
        const body = (await response.text().catch(() => "")).slice(0, 200)
        throw new Error(`resend ${response.status}: ${body}`)
      }
    },
  }
}
```

`apps/api/src/mail/smtp.ts`:
```ts
import nodemailer, { type Transporter } from "nodemailer"
import type { Mailer, Message } from "./mailer"

type Options = { url: string; from: string; jsonTransport?: boolean }

/** Any SMTP server (Mailpit in Compose, or a provider's SMTP endpoint) via Nodemailer. */
export function smtpMailer({ url, from, jsonTransport = false }: Options): Mailer & {
  sendRaw(message: Message): ReturnType<Transporter["sendMail"]>
} {
  const transport: Transporter = jsonTransport
    ? nodemailer.createTransport({ jsonTransport: true })
    : nodemailer.createTransport(url)
  const sendRaw = (message: Message) =>
    transport.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    })
  return {
    kind: "smtp",
    sendRaw,
    async send(message) {
      await sendRaw(message)
    },
  }
}
```

`apps/api/src/mail/create-mailer.ts`:
```ts
import { logMailer } from "./log"
import type { Mailer } from "./mailer"
import { resendMailer } from "./resend"
import { smtpMailer } from "./smtp"

export type MailEnv = {
  MAIL_PROVIDER: "log" | "smtp" | "resend"
  MAIL_FROM: string
  SMTP_URL?: string
  RESEND_API_KEY?: string
}

/** Picks the adapter from env. Throws on a missing key so the process fails at startup. */
export function createMailer(env: MailEnv): Mailer {
  switch (env.MAIL_PROVIDER) {
    case "smtp":
      if (!env.SMTP_URL) throw new Error("MAIL_PROVIDER=smtp needs SMTP_URL")
      return smtpMailer({ url: env.SMTP_URL, from: env.MAIL_FROM })
    case "resend":
      if (!env.RESEND_API_KEY) throw new Error("MAIL_PROVIDER=resend needs RESEND_API_KEY")
      return resendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM })
    default:
      return logMailer()
  }
}
```

Delete `apps/api/src/mailer.ts`; update imports (`server.ts`, `router.ts`, `test-server.ts`) to `./mail/mailer` and `./mail/log`.

- [ ] **Step 5: Env**

`apps/api/src/env.ts` — add to `EnvSchema`:
```ts
  // Where account links in mail point (password-changed notice). Required in production.
  ACCOUNT_URL: optionalString.pipe(z.string().url().optional()),
  MAIL_PROVIDER: z.enum(["log", "smtp", "resend"]).default("log"),
  MAIL_FROM: optionalString,
  SMTP_URL: optionalString,
  RESEND_API_KEY: optionalString,
```
Import `siteUrl` from `@repo/sites`; `export const DEV_ACCOUNT_URL = siteUrl("account", {})` and `DEV_MAIL_FROM = "Boilerplate <no-reply@brand.localhost>"`. `Env` type: `ACCOUNT_URL: string; MAIL_FROM: string` (omit both from the inferred type like `AUTH_URL`). In `loadEnv`:
```ts
  if (!env.ACCOUNT_URL && env.NODE_ENV === "production") throw new Error("ACCOUNT_URL is not set")
  const accountUrl = (env.ACCOUNT_URL ?? DEV_ACCOUNT_URL).replace(/\/+$/, "")
  if (env.MAIL_PROVIDER === "smtp" && !env.SMTP_URL) throw new Error("MAIL_PROVIDER=smtp needs SMTP_URL")
  if (env.MAIL_PROVIDER === "resend" && !env.RESEND_API_KEY) throw new Error("MAIL_PROVIDER=resend needs RESEND_API_KEY")
  // The dev sender is a placeholder domain; a real provider refuses it, so production must set it.
  if (env.MAIL_PROVIDER !== "log" && env.NODE_ENV === "production" && !env.MAIL_FROM) {
    throw new Error("MAIL_FROM is not set")
  }
  const mailFrom = env.MAIL_FROM ?? DEV_MAIL_FROM
  return { ...env, API_SERVICE_TOKEN: token, AUTH_URL: authUrl, ACCOUNT_URL: accountUrl, MAIL_FROM: mailFrom }
```
(Note: `optionalString` turns `""` into `undefined` — confirm in the file; the production `MAIL_FROM: ""` test relies on it.)

- [ ] **Step 6: Wire the server and switch the reset mail to the template**

`server.ts`: `ServerOptions` gains `accountUrl: string` (doc: "Base URL of the account app; the password-changed notice links to `${accountUrl}/security`"); `Context` (router.ts) gains `accountUrl: string`; pass it in `handle`. `index.ts`: replace `const mailer = undefined` with
```ts
import { createMailer } from "./mail/create-mailer"
// after loadEnv:
const mailer = createMailer(env)
// pass mailer and accountUrl: env.ACCOUNT_URL to createServer
if (mailer.kind === "log" && env.NODE_ENV === "production") {
  console.warn("⚠ MAIL_PROVIDER=log: emails are written to the log only. Set MAIL_PROVIDER=smtp or resend.")
}
```
`test-server.ts`: `start()` passes `accountUrl: "http://account.example.com"`; `captureMailer` records full `Message`s (`Sent = Message`, `kind: "log"`).

`router.ts` `requestPasswordReset`: replace the inline `text` with
```ts
      const mail = await emails.resetPassword({ name: user.name || undefined, link })
      void context.mailer
        .send({ to: user.email, ...mail, idempotencyKey: `reset:${user.id}:${tokenHash(token).slice(0, 16)}` })
        .then(() => context.log(`mail sent reset to ${maskEmail(user.email)}`, undefined))
        .catch((error) => context.log("password-reset mail failed", error))
```
with `import { emails } from "@repo/email"` and `import { maskEmail } from "./mail/mailer"`. `context.log`'s signature is `(message, error)`; passing `undefined` as the error is accepted — if the default logger prints `undefined`, change `log` in `server.ts` to omit a nullish error: `error === undefined ? console.error(…message) : console.error(…message, error)`.

Update the existing reset test in `auth.test.ts` that reads `app.mailer.sent[0].text` for the link — the link is still in `text`; subject is now "Reset your password" (already was). Confirm the test still matches `/reset-password\?token=([A-Za-z0-9_-]+)/` against `text`.

- [ ] **Step 7: Planner test, `.env.example`, run everything**

`scripts/ci-plan.test.ts`: add
```ts
  test("an email change reaches the api and the story app", () => {
    const p = plan(["packages/email/src/index.tsx"], ctx)
    expect(p.affected).toEqual(["@repo/api", "@repo/story", "@repo/email"])
    expect(p.typecheck).toEqual(["@repo/api", "@repo/email"])
    expect(p.tests).toEqual(["@repo/api", "@repo/email"])
  })
```
(ordering follows the file's convention — workspace-dir sort for `affected`, root-script order for the lists; run it, compare with the received value, and pin what the planner actually produces if only the order differs). Also update the existing "sites change" test: `@repo/api` now depends on `@repo/sites`, so `affected`/`typecheck`/`tests` for a sites change gain `@repo/api` (keep the file's ordering convention — run the test, read the received value, confirm it is only `@repo/api` that was added, then pin it).

`apps/api/.env.example`: add the five vars with one-line comments mirroring the env table in the spec.

Run: `bunx biome check --write apps/api scripts && bun run --filter @repo/api typecheck && bun test apps/api && bun test scripts`
Expected: all green (api test count = previous 71 + new).

- [ ] **Step 8: Commit**

```bash
git add apps/api scripts/ci-plan.test.ts bun.lock
git commit -m "feat(api): log, smtp and resend mailers behind one seam; reset mail on the React Email template"
```

---

### Task 4: `tokens` table and queries (migration `0004_email_verification`)

**Files:**
- Create: `apps/api/src/migrations/0004_email_verification.ts`, `apps/api/src/queries/tokens.ts`
- Delete: `apps/api/src/queries/password-resets.ts`
- Modify: `apps/api/src/migrations/index.ts`, `db.ts`, `queries/users.ts` (`UserRow.email_verified_at`, `markEmailVerified`), `queries/queries.test.ts`, `migrate.test.ts`, `router.ts` (rename `passwordResets` → `tokens` with purpose), `credentials.ts` (`VERIFY_TTL_MS`)

**Interfaces:**
- Produces: `TokenPurpose = "password_reset" | "email_verify"`; `db.tokens.create({ userId, purpose, tokenHash, expiresAt })`, `consume(tokenHash, purpose, at) → { userId } | undefined`, `invalidateForUser(userId, purpose, at)`, `deleteStale(now)`; `db.users.markEmailVerified(id, at)`; `UserRow.email_verified_at: string | null`; `VERIFY_TTL_MS = 24 * 60 * 60_000`.

- [ ] **Step 1: Failing tests**

In `apps/api/src/queries/queries.test.ts` (read its setup: it opens a test database and runs migrations), add:
```ts
describe("tokens", () => {
  test("consume honours purpose, single use and expiry", async () => {
    const user = await db.users.create({ email: "t1@example.com", passwordHash: "x", name: "" })
    const future = new Date(Date.now() + 60_000).toISOString()
    await db.tokens.create({ userId: user.id, purpose: "email_verify", tokenHash: "h1", expiresAt: future })
    expect(await db.tokens.consume("h1", "password_reset", new Date().toISOString())).toBeUndefined()
    expect(await db.tokens.consume("h1", "email_verify", new Date().toISOString())).toEqual({ userId: user.id })
    expect(await db.tokens.consume("h1", "email_verify", new Date().toISOString())).toBeUndefined()
    await db.tokens.create({ userId: user.id, purpose: "email_verify", tokenHash: "h2", expiresAt: new Date(Date.now() - 1).toISOString() })
    expect(await db.tokens.consume("h2", "email_verify", new Date().toISOString())).toBeUndefined()
  })

  test("invalidateForUser burns one purpose only", async () => {
    const user = await db.users.create({ email: "t2@example.com", passwordHash: "x", name: "" })
    const future = new Date(Date.now() + 60_000).toISOString()
    await db.tokens.create({ userId: user.id, purpose: "email_verify", tokenHash: "v", expiresAt: future })
    await db.tokens.create({ userId: user.id, purpose: "password_reset", tokenHash: "r", expiresAt: future })
    await db.tokens.invalidateForUser(user.id, "email_verify", new Date().toISOString())
    expect(await db.tokens.consume("v", "email_verify", new Date().toISOString())).toBeUndefined()
    expect(await db.tokens.consume("r", "password_reset", new Date().toISOString())).toEqual({ userId: user.id })
  })

  test("markEmailVerified sets the timestamp once", async () => {
    const user = await db.users.create({ email: "t3@example.com", passwordHash: "x", name: "" })
    expect(user.email_verified_at).toBeNull()
    await db.users.markEmailVerified(user.id, "2026-10-01T00:00:00.000Z")
    expect((await db.users.find(user.id))?.email_verified_at).toBe("2026-10-01T00:00:00.000Z")
  })
})
```

In `migrate.test.ts` add a test that applies `0001`–`0003`, inserts a `password_resets` row, applies `0004`, and asserts the row is in `tokens` with `purpose = 'password_reset'` and `password_resets` no longer exists (SQLite: `SELECT name FROM sqlite_master WHERE name='password_resets'` → none; Postgres: `to_regclass('password_resets')` → null — use `dialect` the way the file's other tests do).

- [ ] **Step 2: Run to verify they fail**

Run: `bun test apps/api/src/queries apps/api/src/migrate.test.ts`
Expected: FAIL — `db.tokens` undefined, migration missing.

- [ ] **Step 3: Migration**

`apps/api/src/migrations/0004_email_verification.ts`:
```ts
import { ddl } from "../dialect"
import type { Migration } from "../migrate"

// One table for every one-time token; `purpose` keeps resets and verifications apart.
const emailVerification: Migration = {
  name: "0004_email_verification",
  async up(sql, dialect) {
    await sql.unsafe("ALTER TABLE users ADD COLUMN email_verified_at TEXT")
    await sql.unsafe(`
      CREATE TABLE tokens (
        id ${ddl.serialId(dialect)},
        user_id INTEGER NOT NULL,
        purpose TEXT NOT NULL CHECK (purpose IN ('password_reset', 'email_verify')),
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        created_at TEXT NOT NULL
      )
    `)
    await sql.unsafe("CREATE INDEX tokens_user_purpose ON tokens (user_id, purpose)")
    await sql.unsafe(`
      INSERT INTO tokens (user_id, purpose, token_hash, expires_at, consumed_at, created_at)
      SELECT user_id, 'password_reset', token_hash, expires_at, used_at, expires_at
      FROM password_resets
    `)
    await sql.unsafe("DROP TABLE password_resets")
  },
}

export default emailVerification
```
(`created_at` for migrated rows is set to `expires_at` because the old table did not record creation; the comment in the file should say so.) Register it in `migrations/index.ts`.

- [ ] **Step 4: Queries**

`apps/api/src/queries/tokens.ts`:
```ts
import type { SQL } from "bun"

export type TokenPurpose = "password_reset" | "email_verify"

export function tokensQueries(sql: SQL) {
  return {
    async create(input: { userId: number; purpose: TokenPurpose; tokenHash: string; expiresAt: string }): Promise<void> {
      await sql`
        INSERT INTO tokens (user_id, purpose, token_hash, expires_at, created_at)
        VALUES (${input.userId}, ${input.purpose}, ${input.tokenHash}, ${input.expiresAt}, ${new Date().toISOString()})
      `
    },

    /** Marks the token consumed and returns its owner, only if it matches the purpose, is unused and unexpired. */
    async consume(tokenHash: string, purpose: TokenPurpose, at: string): Promise<{ userId: number } | undefined> {
      const rows: Array<{ user_id: number }> = await sql`
        UPDATE tokens SET consumed_at = ${at}
        WHERE token_hash = ${tokenHash} AND purpose = ${purpose} AND consumed_at IS NULL AND expires_at > ${at}
        RETURNING user_id
      `
      return rows[0] && { userId: rows[0].user_id }
    },

    /** Burns every outstanding token of one purpose for a user. */
    async invalidateForUser(userId: number, purpose: TokenPurpose, at: string): Promise<void> {
      await sql`
        UPDATE tokens SET consumed_at = ${at}
        WHERE user_id = ${userId} AND purpose = ${purpose} AND consumed_at IS NULL
      `
    },

    /** Drops rows that can never be consumed again: used or expired, any purpose. */
    async deleteStale(now: string): Promise<void> {
      await sql`DELETE FROM tokens WHERE consumed_at IS NOT NULL OR expires_at <= ${now}`
    },
  }
}
```
`db.ts`: `tokens: tokensQueries(sql)` replaces `passwordResets`. `users.ts`: `UserRow` gains `email_verified_at: string | null`; add
```ts
    async markEmailVerified(id: number, at: string): Promise<void> {
      await sql`UPDATE users SET email_verified_at = ${at}, updated_at = ${at} WHERE id = ${id} AND email_verified_at IS NULL`
    },
```
`credentials.ts`: `export const VERIFY_TTL_MS = 24 * 60 * 60_000`.

`router.ts`: `passwordResets.create({ userId, tokenHash, expiresAt })` → `tokens.create({ userId, purpose: "password_reset", tokenHash, expiresAt })`; `consume(hash, at)` → `consume(hash, "password_reset", at)`; `invalidateForUser(id, at)` → `invalidateForUser(id, "password_reset", at)` (two call sites: resetPassword, changePassword); `passwordResets.deleteStale` → `tokens.deleteStale`.

- [ ] **Step 5: Run the tests**

Run: `bun test apps/api` and, with Postgres up (`docker run -d --rm --name pg-test -p 127.0.0.1:5432:5432 -e POSTGRES_PASSWORD=postgres postgres:17-alpine`), `bun --filter @repo/api test:postgres`.
Expected: all pass on both engines (if Postgres is not available, say so in the report; CI's `api-postgres` job covers it).

- [ ] **Step 6: Commit**

```bash
bunx biome check --write apps/api
git add apps/api
git commit -m "feat(api): one tokens table with a purpose replaces password_resets; users.email_verified_at"
```

---

### Task 5: Verification procedures, `emailVerified` in the contract, password-changed mail

**Files:**
- Modify: `packages/api-contract/src/auth.ts` (`UserSchema.emailVerified`, `VerifyEmailSchema`, `ResendVerificationResultSchema`), `packages/api-contract/src/index.ts` (`auth.verifyEmail`, `account.resendVerification`), `packages/api-contract/src/auth.test.ts` (if it pins UserSchema keys)
- Modify: `apps/api/src/router.ts`, `server.ts` (`verifyLimiter`), `test-server.ts`, `apps/api/src/auth.test.ts` (new `describe` blocks), `packages/session/src/client.test.ts` (fixture gains `emailVerified: false`)

**Interfaces:**
- Consumes: Tasks 3–4.
- Produces: `User.emailVerified: boolean`; `client.auth.verifyEmail({ token }) → void` (errors `BAD_REQUEST`); `client.account.resendVerification() → { sent: boolean }` (errors `AUTH_ERRORS`, `TOO_MANY_REQUESTS`); `ServerOptions.verifyLimiter?`.

- [ ] **Step 1: Failing tests**

`apps/api/src/auth.test.ts` — add:
```ts
describe("email verification", () => {
  const linkOf = (text: string) => text.match(/verify-email\?token=([A-Za-z0-9_-]+)/)?.[1]

  test("sign-up sends one verify mail and me() reports unverified", async () => {
    app.mailer.sent.length = 0
    const { client, email } = await signUp(app)
    const verify = app.mailer.sent.filter((m) => m.subject === "Verify your email")
    expect(verify).toHaveLength(1)
    expect(verify[0]?.to).toBe(email)
    expect(verify[0]?.text).toContain("http://auth.example.com/verify-email?token=")
    expect((await client.auth.me()).user.emailVerified).toBe(false)
  })

  test("the link verifies once; reuse and other purposes are BAD_REQUEST", async () => {
    app.mailer.sent.length = 0
    const { client } = await signUp(app)
    const token = linkOf(app.mailer.sent.at(-1)?.text ?? "")
    if (!token) throw new Error("no verify link")
    await clientFor(app).auth.verifyEmail({ token })
    expect((await client.auth.me()).user.emailVerified).toBe(true)
    const [again] = await safe(clientFor(app).auth.verifyEmail({ token }))
    expect(again).toMatchObject({ code: "BAD_REQUEST" })
    // A reset token is not a verification token.
    const { email } = await signUp(app)
    app.mailer.sent.length = 0
    await clientFor(app).auth.requestPasswordReset({ email })
    const reset = app.mailer.sent.at(-1)?.text.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1]
    const [crossed] = await safe(clientFor(app).auth.verifyEmail({ token: reset ?? "" }))
    expect(crossed).toMatchObject({ code: "BAD_REQUEST" })
  })

  test("resend issues a new link, burns the old one, no-ops when verified, and is limited per user", async () => {
    app.mailer.sent.length = 0
    const a = await signUp(app)
    const first = linkOf(app.mailer.sent.at(-1)?.text ?? "")
    expect(await a.client.account.resendVerification()).toEqual({ sent: true })
    const second = linkOf(app.mailer.sent.at(-1)?.text ?? "")
    expect(second).not.toBe(first)
    const [old] = await safe(clientFor(app).auth.verifyEmail({ token: first ?? "" }))
    expect(old).toMatchObject({ code: "BAD_REQUEST" })
    await a.client.account.resendVerification()
    await a.client.account.resendVerification()
    const [limited] = await safe(a.client.account.resendVerification())
    expect(limited).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    // Another user is not affected by A's limit.
    const b = await signUp(app)
    expect(await b.client.account.resendVerification()).toEqual({ sent: true })
    // Verified users get sent: false.
    await clientFor(app).auth.verifyEmail({ token: second ?? "" })
    expect(await a.client.account.resendVerification()).toEqual({ sent: false })
  })

  test("a rejecting mailer does not break sign-up", async () => {
    const failing = await start({ mailer: { kind: "log", send: async () => { throw new Error("down") } } })
    try {
      const { user } = await signUp(failing)
      expect(user.emailVerified).toBe(false)
    } finally {
      await failing.stop()
    }
  })

  test("reset and change-password send a password-changed notice", async () => {
    const { client, email } = await signUp(app)
    app.mailer.sent.length = 0
    await clientFor(app).auth.requestPasswordReset({ email })
    const token = app.mailer.sent.at(-1)?.text.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1]
    await clientFor(app).auth.resetPassword({ token: token ?? "", password: "another horse battery" })
    const notice = app.mailer.sent.find((m) => m.subject === "Your password was changed")
    expect(notice?.to).toBe(email)
    expect(notice?.text).toContain("http://account.example.com/security")
    app.mailer.sent.length = 0
    const { session } = await clientFor(app).auth.signIn({ email, password: "another horse battery" })
    await clientFor(app, session.token).account.changePassword({ currentPassword: "another horse battery", newPassword: "third horse battery" })
    expect(app.mailer.sent.some((m) => m.subject === "Your password was changed")).toBe(true)
    void client
  })
})
```
Timing: every handler awaits `emails.*` (rendering) before calling `mailer.send`, and `captureMailer.send` pushes synchronously before its first `await`, so `app.mailer.sent` is populated before the response returns. Keep that order in Step 3.

`packages/session/src/client.test.ts`: fixtures that build a `User` gain `emailVerified: false` (the type will demand it).

- [ ] **Step 2: Run to verify they fail**

Run: `bun test apps/api/src/auth.test.ts`
Expected: FAIL — `verifyEmail` / `resendVerification` not in contract.

- [ ] **Step 3: Contract and handlers**

`packages/api-contract/src/auth.ts`: `UserSchema` gains `emailVerified: z.boolean()`; add
```ts
export const VerifyEmailSchema = z.object({ token: z.string().min(1).max(128) })
export const ResendVerificationResultSchema = z.object({ sent: z.boolean() })
```
`index.ts`: under `auth`
```ts
    verifyEmail: oc
      .route({ method: "POST", path: "/auth/email/verify", summary: "Confirm an email address from a verify link" })
      .errors({ BAD_REQUEST: { message: "This verification link is invalid, expired or already used" } })
      .input(VerifyEmailSchema)
      .output(z.void()),
```
under `account`
```ts
    resendVerification: oc
      .route({ method: "POST", path: "/account/email/resend-verification", summary: "Send the verify link again" })
      .errors({ ...AUTH_ERRORS, TOO_MANY_REQUESTS: { message: "Too many requests, try again in a few minutes" } })
      .input(empty)
      .output(ResendVerificationResultSchema),
```

`router.ts`:
- `toUser` adds `emailVerified: row.email_verified_at !== null`.
- `Context` gains `verifyLimiter: RateLimiter`; `server.ts` creates it (`options.verifyLimiter ?? createMemoryRateLimiter({ limit: 3, windowMs: 15 * 60_000 })`) and passes it; `ServerOptions.verifyLimiter?` documented "Throttles verification resends per user. Defaults to 3 per 15 minutes."
- A helper above the router:
```ts
/** Issues a verification token and sends the link. Rendering is awaited; sending is not. */
async function sendVerification(context: Context, user: UserRow) {
  const now = Date.now()
  const token = newToken()
  await context.db.tokens.invalidateForUser(user.id, "email_verify", new Date(now).toISOString())
  await context.db.tokens.create({
    userId: user.id,
    purpose: "email_verify",
    tokenHash: tokenHash(token),
    expiresAt: new Date(now + VERIFY_TTL_MS).toISOString(),
  })
  const link = `${context.authUrl}/verify-email?token=${token}`
  const mail = await emails.verifyEmail({ name: user.name || undefined, link })
  void context.mailer
    .send({ to: user.email, ...mail, idempotencyKey: `verify:${user.id}:${tokenHash(token).slice(0, 16)}` })
    .then(() => context.log(`mail sent verify to ${maskEmail(user.email)}`, undefined))
    .catch((error) => context.log("verification mail failed", error))
}

async function sendPasswordChanged(context: Context, user: UserRow) {
  const mail = await emails.passwordChanged({
    name: user.name || undefined,
    at: new Date().toISOString(),
    accountUrl: `${context.accountUrl}/security`,
  })
  void context.mailer
    .send({ to: user.email, ...mail })
    .then(() => context.log(`mail sent password-changed to ${maskEmail(user.email)}`, undefined))
    .catch((error) => context.log("password-changed mail failed", error))
}
```
- `signUp`: after `user` is created, `await sendVerification(context, user)` before `return issueSession(...)`. (Rendering is a few ms; the send is not awaited.)
- `verifyEmail`:
```ts
    verifyEmail: api.auth.verifyEmail.handler(async ({ input, context, errors }) => {
      const at = new Date().toISOString()
      const consumed = await context.db.tokens.consume(tokenHash(input.token), "email_verify", at)
      if (!consumed) throw errors.BAD_REQUEST()
      await context.db.users.markEmailVerified(consumed.userId, at)
      await context.db.tokens.invalidateForUser(consumed.userId, "email_verify", at)
    }),
```
- `account.resendVerification`:
```ts
    resendVerification: authed.account.resendVerification.handler(async ({ context, errors }) => {
      if (context.user.email_verified_at) return { sent: false }
      const limit = await context.verifyLimiter.hit(`verify:${context.user.id}`)
      if (!limit.allowed) throw errors.TOO_MANY_REQUESTS()
      await sendVerification(context, context.user)
      return { sent: true }
    }),
```
- `resetPassword`: after `sessions.deleteForUser`, `const user = await context.db.users.find(consumed.userId); if (user) await sendPasswordChanged(context, user)`.
- `changePassword`: after `sessions.deleteForUser(..., { except })`, `await sendPasswordChanged(context, context.user)`.

- [ ] **Step 4: Run tests on both engines**

Run: `bun run --filter @repo/api-contract typecheck && bun run --filter @repo/api typecheck && bun run --filter @repo/session typecheck && bun test apps/api packages/api-contract packages/session` (+ `test:postgres` if available).
Expected: all pass; the api-contract's REST/OpenAPI test (if any pins the route list) is updated for the two new routes.

- [ ] **Step 5: Commit**

```bash
bunx biome check --write apps/api packages/api-contract packages/session
git add apps/api packages/api-contract packages/session
git commit -m "feat(api): soft email verification — verify link on sign-up, resend with a per-user limit, password-changed notice"
```

---

### Task 6: `apps/auth` — `/verify-email`

**Files:**
- Create: `apps/auth/src/app/verify-email/page.tsx`, `apps/auth/src/views/verify-email-view.tsx`, `apps/auth/src/lib/verify-email.ts`, `apps/auth/src/lib/verify-email.test.ts`
- Modify: `apps/auth/README.md` (route list)

**Interfaces:**
- Consumes: `client.auth.verifyEmail` (Task 5), `getAuth().anonymousApi({ ip })`, `siteUrl("account")` from `@repo/sites`, `requestInfo`.
- Produces: `verifyEmailCore(deps, token) → "verified" | "invalid"`, `isPlausibleToken(token)`.

- [ ] **Step 1: Failing core tests**

`apps/auth/src/lib/verify-email.test.ts`:
```ts
import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { isPlausibleToken, verifyEmailCore } from "./verify-email"

const good = "a".repeat(43)

describe("isPlausibleToken", () => {
  test("accepts exactly 43 base64url characters", () => {
    expect(isPlausibleToken(good)).toBe(true)
    expect(isPlausibleToken("A-_z".repeat(10) + "abc")).toBe(true)
  })
  test("rejects the wrong length or alphabet", () => {
    expect(isPlausibleToken("")).toBe(false)
    expect(isPlausibleToken(`${good}a`)).toBe(false)
    expect(isPlausibleToken(`${good.slice(1)}=`)).toBe(false)
  })
})

describe("verifyEmailCore", () => {
  test("does not call the api for an implausible token", async () => {
    let calls = 0
    const out = await verifyEmailCore({ verifyEmail: async () => { calls++ } }, "nope")
    expect(out).toBe("invalid")
    expect(calls).toBe(0)
  })
  test("verified when the api accepts", async () => {
    expect(await verifyEmailCore({ verifyEmail: async () => {} }, good)).toBe("verified")
  })
  test("invalid when the api declares BAD_REQUEST, and when it is down", async () => {
    const bad = new ORPCError("BAD_REQUEST", { defined: true, message: "x" })
    expect(await verifyEmailCore({ verifyEmail: async () => { throw bad } }, good)).toBe("invalid")
    expect(await verifyEmailCore({ verifyEmail: async () => { throw new Error("down") } }, good)).toBe("invalid")
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `bun test apps/auth/src/lib/verify-email.test.ts` → FAIL (module missing).

- [ ] **Step 3: Core, view, page**

`apps/auth/src/lib/verify-email.ts`:
```ts
import { ORPCError } from "@orpc/client"

/** `newToken()` in apps/api: 32 bytes base64url, always 43 characters. Anything else never hits the api. */
export const isPlausibleToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token)

export type VerifyEmailDeps = { verifyEmail(input: { token: string }): Promise<void> }

/** Both failure kinds render the same page; an undeclared error is logged because it is ours to fix. */
export async function verifyEmailCore(deps: VerifyEmailDeps, token: string): Promise<"verified" | "invalid"> {
  if (!isPlausibleToken(token)) return "invalid"
  try {
    await deps.verifyEmail({ token })
    return "verified"
  } catch (error) {
    if (!(error instanceof ORPCError && error.defined && error.code === "BAD_REQUEST")) {
      console.error("[auth] verifyEmail failed", error)
    }
    return "invalid"
  }
}
```

`apps/auth/src/views/verify-email-view.tsx`:
```tsx
import { siteUrl } from "@repo/sites"
import { Button } from "@repo/ui/components/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@repo/ui/components/card"
import Link from "next/link"
import { AuthLayout } from "@/components/auth-layout"

export function VerifyEmailView({ result, signedIn, appUrl }: { result: "verified" | "invalid"; signedIn: boolean; appUrl: string }) {
  const accountInfo = `${siteUrl("account")}/personal-info`
  return (
    <AuthLayout>
      <Card>
        <CardHeader className="text-center">
          {result === "verified" ? (
            <>
              <CardTitle className="text-xl">Email verified</CardTitle>
              <CardDescription>Thanks — your email address is confirmed.</CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-xl">This link has expired or was already used</CardTitle>
              <CardDescription>Sign in and request a new verification email from your account.</CardDescription>
            </>
          )}
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full">
            {result === "verified" ? (
              signedIn ? <a href={appUrl}>Open the app</a> : <Link href="/login">Sign in</Link>
            ) : (
              <Link href={`/login?next=${encodeURIComponent(accountInfo)}`}>Sign in and request a new one</Link>
            )}
          </Button>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
```

`apps/auth/src/app/verify-email/page.tsx`:
```tsx
import type { Metadata } from "next"
import { headers } from "next/headers"
import { getAuth } from "@/lib/auth"
import { requestInfo } from "@/lib/request-info"
import { verifyEmailCore } from "@/lib/verify-email"
import { VerifyEmailView } from "@/views/verify-email-view"

export const metadata: Metadata = { title: "Verify email" }

type Search = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

// The link is the action: one api call per request, no form. A refresh of a used link shows the
// failure state, which is the truth.
export default async function VerifyEmailPage({ searchParams }: { searchParams: Search }) {
  const token = first((await searchParams).token) ?? ""
  const auth = getAuth()
  const { ip } = requestInfo(await headers())
  const api = await auth.anonymousApi({ ip })
  const result = await verifyEmailCore({ verifyEmail: api.auth.verifyEmail }, token)
  const user = await auth.getUser()
  return <VerifyEmailView result={result} signedIn={user !== null} appUrl={auth.appUrl} />
}
```
Read `createAuth`'s return to find how `appUrl` is exposed (there is a `safeNextUrl` and an `appUrl` option — if `appUrl` is not returned, use `auth.safeNextUrl(undefined)`, which resolves to it).

- [ ] **Step 4: Run tests, typecheck, build**

Run: `bun test apps/auth && bun run --filter @repo/auth typecheck && bun --filter @repo/auth build`
Expected: green; the route table lists `/verify-email` as dynamic (ƒ).

- [ ] **Step 5: README and commit**

`apps/auth/README.md`: add `/verify-email?token=` to the routes list with one line on the two states.

```bash
bunx biome check --write apps/auth
git add apps/auth
git commit -m "feat(auth): /verify-email confirms the address from the emailed link"
```

---

### Task 7: `apps/account` — verification state and resend

**Files:**
- Create: `apps/account/src/components/verify-email-notice.tsx`, `apps/account/src/app/(account)/personal-info/verification-actions.ts`
- Modify: `apps/account/src/lib/actions.ts` (`resendVerificationCore`, `AccountApi` gains `resendVerification`), `apps/account/src/lib/actions.test.ts`, `apps/account/src/views/personal-info-view.tsx`, `apps/account/src/views/home-view.tsx`, `apps/account/README.md`

**Interfaces:**
- Consumes: `User.emailVerified`, `client.account.resendVerification()`.
- Produces: `resendVerificationCore(deps) → FormState`; `<VerifyEmailNotice user />`.

- [ ] **Step 1: Failing core tests**

`apps/account/src/lib/actions.test.ts` — add (match the file's fake-api helper):
```ts
describe("resendVerificationCore", () => {
  test("reports sent", async () => {
    const out = await resendVerificationCore({ api: { ...fakeApi, resendVerification: async () => ({ sent: true }) } })
    expect(out).toEqual({ ok: true, message: "Sent — check your inbox." })
  })
  test("already verified", async () => {
    const out = await resendVerificationCore({ api: { ...fakeApi, resendVerification: async () => ({ sent: false }) } })
    expect(out).toEqual({ ok: true, message: "Your email is already verified." })
  })
  test("the limiter's message is shown", async () => {
    const limited = new ORPCError("TOO_MANY_REQUESTS", { defined: true, message: "Too many requests, try again in a few minutes" })
    const out = await resendVerificationCore({ api: { ...fakeApi, resendVerification: async () => { throw limited } } })
    expect(out).toEqual({ ok: false, message: "Too many requests, try again in a few minutes" })
  })
})
```

- [ ] **Step 2: Run to verify they fail** — `bun test apps/account` → FAIL.

- [ ] **Step 3: Core, action, component, views**

`lib/actions.ts`: `AccountApi` adds `"resendVerification"` to the `Pick`; add
```ts
export async function resendVerificationCore(deps: ActionDeps): Promise<FormState> {
  try {
    const { sent } = await deps.api.resendVerification()
    return { ok: true, message: sent ? "Sent — check your inbox." : "Your email is already verified." }
  } catch (error) {
    return { ok: false, message: failure(error, ["TOO_MANY_REQUESTS"], "resendVerification") }
  }
}
```

`app/(account)/personal-info/verification-actions.ts`:
```ts
"use server"

import { type FormState, resendVerificationCore } from "@/lib/actions"
import { getAuth } from "@/lib/auth"

export async function resendVerification(_prev: FormState): Promise<FormState> {
  const auth = getAuth()
  await auth.requireUser()
  return resendVerificationCore({ api: (await auth.api()).account })
}
```

`components/verify-email-notice.tsx`:
```tsx
"use client"

import type { User } from "@repo/api-contract"
import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { useActionState } from "react"
import { resendVerification } from "@/app/(account)/personal-info/verification-actions"
import type { FormState } from "@/lib/actions"

/** Shown while the email is unverified: one sentence and a resend button with live feedback. */
export function VerifyEmailNotice({ user }: { user: Pick<User, "email" | "emailVerified"> }) {
  const [state, action, pending] = useActionState(resendVerification, { ok: false } as FormState)
  if (user.emailVerified) return null
  return (
    <form action={action} className="flex flex-col gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm dark:border-amber-700 dark:bg-amber-950">
      <p>
        <strong>Verify your email.</strong> We sent a link to {user.email}. It secures your account
        and is needed for some features.
      </p>
      <FormMessage state={state} />
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Sending…" : "Resend verification email"}
        </Button>
      </div>
    </form>
  )
}
```

`views/personal-info-view.tsx`: in the Contact info card, next to the email render `<Badge variant={user.emailVerified ? "secondary" : "outline"}>{user.emailVerified ? "Verified" : "Unverified"}</Badge>` (import `Badge` from `@repo/ui/components/badge`) and, below the card content when unverified, `<VerifyEmailNotice user={user} />`. `views/home-view.tsx`: render `<VerifyEmailNotice user={user} />` above the overview cards (it returns null when verified).

- [ ] **Step 4: Run, typecheck, build**

Run: `bun test apps/account && bun run --filter @repo/account typecheck && bun --filter @repo/account build` → green.

- [ ] **Step 5: README and commit**

`apps/account/README.md`: the notice, the badge, the resend limit.

```bash
bunx biome check --write apps/account
git add apps/account
git commit -m "feat(account): verification badge and a rate-limited resend while the email is unverified"
```

---

### Task 8: Compose (Mailpit), docs, ROADMAP, browser pass, full gate

**Files:**
- Modify: `docker-compose.yml`, `docker-compose.dev.yml`, `.devcontainer/devcontainer.json`, `.env.example`, `CLAUDE.md`, `apps/api/README.md`, `docs/ROADMAP.md`, `docs/superpowers/specs/2026-10-01-transactional-email-design.md` (status → implemented)

- [ ] **Step 1: Compose**

`docker-compose.yml`: add
```yaml
  mailpit:
    image: axllent/mailpit
    ports: ["8025:8025"]
    environment:
      MP_SMTP_AUTH_ACCEPT_ANY: 1
      MP_SMTP_AUTH_ALLOW_INSECURE: 1
```
and on `api`'s `environment`: `MAIL_PROVIDER: ${MAIL_PROVIDER:-smtp}`, `SMTP_URL: ${SMTP_URL:-smtp://mailpit:1025}`, `MAIL_FROM: ${MAIL_FROM:-Boilerplate <no-reply@brand.localhost>}`, `RESEND_API_KEY: ${RESEND_API_KEY:-}`, `ACCOUNT_URL: ${ACCOUNT_URL:-http://localhost:3003}`; `depends_on: [mailpit]`. `docker-compose.dev.yml`: the same `mailpit` service; no api env change (dev stays `log` unless the vars are set). `.devcontainer/devcontainer.json` `forwardPorts` += 8025. Root `.env.example`: a `# ----- Email (apps/api) -----` block with the five vars and the rule each follows.

- [ ] **Step 2: Docs**

CLAUDE.md: under **Authentication**, an **Email** paragraph: the seam (`apps/api/src/mail/`), `MAIL_PROVIDER` values, the env table rows (add `MAIL_PROVIDER`, `MAIL_FROM`, `SMTP_URL`, `RESEND_API_KEY`, `ACCOUNT_URL` to the existing table), templates in `packages/email` ("a new email = template + test + story"), Mailpit at `localhost:8025` in Compose, soft verification (`emailVerified` on `User`, nothing gated; the rule for a future email change: reset `email_verified_at` and send a new link), the `tokens` table. Packages list gains `packages/email`. `apps/api/README.md`: env, `tokens`, `auth.verifyEmail`, `account.resendVerification`. `docs/ROADMAP.md`: new **Phase 6 — the week-one layer** section listing 6a (ticked), 6b OAuth + magic link, 6c marketing kit, and 6d billing / 6e organisations / 6f admin marked "pending owner decision", with a pointer to the benchmark. Spec status → "implemented (Phase 6a)".

- [ ] **Step 3: Browser pass (dev servers for api, auth, account, app)**

1. Sign up on `auth.brand.localhost:3002/signup` → lands on `app`; the api log shows `[api] mail to … — Verify your email` with the link and a `mail sent verify to …` line.
2. `account.brand.localhost:3003` → home shows the notice; personal-info shows `Unverified` + notice.
3. Open the link → `auth…/verify-email?token=…` shows *Email verified* with **Open the app**.
4. Account: badge `Verified`, notice gone. Re-open the link → the failure state with **Sign in and request a new one**.
5. New account; resend ×3 → "Sent — check your inbox." each; 4th → the limiter message.
6. Forgot password → reset → the log shows the reset mail then "Your password was changed" with the `/security` link; change password from account → notice again.
7. Console: zero errors/CSP messages on every page visited.
8. Compose: `docker compose up -d --build api mailpit` (with `API_SERVICE_TOKEN` set in `.env`), `curl` the REST sign-up (`POST /openapi/auth/sign-up`) → the message appears in Mailpit at `localhost:8025`.

- [ ] **Step 4: Full gate and commit**

Run: `bun run ci` → exit 0.

```bash
git add docker-compose.yml docker-compose.dev.yml .devcontainer .env.example CLAUDE.md apps/api/README.md docs
git commit -m "docs(email): Mailpit in Compose, env and single points for email; Phase 6a done"
```
