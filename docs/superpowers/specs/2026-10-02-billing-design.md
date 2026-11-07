# Billing: plans, Stripe behind a provider seam, entitlements (Phase 6d)

**Status:** implemented (2026-10-02)
**Date:** 2026-10-02
**Origin:** `docs/superpowers/research/2026-10-01-boilerplate-benchmark.md`, Phase 6 — sub-project 6d
**Builds on:** 6e (workspaces, roles, `requireWorkspace()`), 6a (`Mailer`-style provider seam, startup
env checks), 6c (`apps/www` pricing block), Phase 4 (`apps/account`, `form-feedback`)
**Reference shape:** the product grown from this repo (`singularorg`): a `BillingDriver` seam with a
real and a memory driver, a subscription mirror (`billing_customer`, `billing_subscription`),
`entitlementsFor` read by the api and the UI, Stripe price ids from the environment.

## Intent

The repo now has tenants but no way to charge them: `apps/account`'s Payments section is a mockup,
`apps/www`'s pricing CTAs lead to sign-up, and nothing in the product is gated. The ROADMAP listed
payments as "a decision a starter should not make"; the benchmark (six of nine kits ship billing)
and the product built from this repo reversed that. This phase adds a **minimal, generic** billing
layer: three plans, Stripe Checkout + Customer Portal + webhooks behind one interface, a keyless
mock that exercises the whole flow, a subscription mirror per workspace, and entitlements that
visibly gate two things — a seat limit and one paid feature.

After this phase: a workspace owner upgrades from Free to Pro or Team on `/payments`, the webhook
mirrors the subscription, members see "x of y seats", the invite form stops at the limit, `/chat`
is a paid feature, and the Customer Portal handles changes, cancellation and invoices. With no
Stripe account the same flow runs against the mock provider.

## Decisions

- **Billing attaches to the workspace**, never to the user; the owner manages it, admins see it.
- **Three flat plans** — `free`, `pro`, `team` — monthly or yearly. No per-seat quantities, no
  proration UI, no trials beyond what a Stripe price defines.
- **Entitlements gate two things**: a **seat limit** (members only; pending invitations do not
  count) and the **`chat` feature**. Both mechanisms a real product needs — a quota and a flag.
- **Stripe via the official `stripe` SDK**, confined to one file behind a `BillingProvider`
  interface; **hosted Checkout** and the **Customer Portal**, never an embedded card form.
- **Keyless default**: `BILLING_PROVIDER=mock` activates a plan instantly on "checkout" and offers
  an in-app change/cancel form, so the repo demos and tests billing without an account.
- **Prices live in the environment** (`STRIPE_PRICE_*`), never in code: a price id belongs to the
  Stripe account that minted it.
- **Entitlements are computed from the mirror on every read** (no cache beyond the request).
- Out of scope: per-seat billing, proration UI, in-app invoice lists (the portal has them), taxes,
  coupons, usage metering, several providers at once, `apps/auth` acting on `?plan=`.

**As built** (where the code differs from, or adds to, the components below):

- **`hasPrice(plan, interval)` on the seam.** `billing.checkout` asks the provider whether the pair
  is sellable (stripe: its `STRIPE_PRICE_*` is set; mock: always) before `BAD_REQUEST` "This plan is
  not available", instead of reading the env itself.
- **Out-of-order deliveries.** `BillingEvent` carries `createdAt` (the provider's event time) and
  `billing_subscriptions` a `source_updated_at` column (added to `0010_billing` in place — it was
  not merged yet). The subscription upsert writes only when the event is not older than the row; an
  older one is recorded in `billing_events` and answers `applied: false, reason: "stale"`.
- **Two more not-applied outcomes**, both answered `200` so Stripe stops retrying: `conflict` (the
  provider customer is already mirrored to another workspace — the `UNIQUE (provider, customer_id)`
  upsert would otherwise roll back the event record and be retried forever) and `gone` (the
  workspace was deleted since checkout — its foreign keys would fail the same way). `unknown_price`
  is an `unknownPrice` flag on the event rather than `subscription: null`; the customer is still
  mirrored.
- **The mock writes through the mirror.** `mockProvider` emits `BillingEvent`s into
  `applyBillingEvent` (provider `mock`, customer `mock_<workspaceId>`, subscription
  `mock_sub_<workspaceId>`), so it exercises the same idempotency and ordering code as Stripe.
- **Contract details.** `MockChangeSchema.plan` is `[...PAID_PLANS, "cancel"]` with `interval`
  defaulting to `month`; `billing.checkout`'s `CONFLICT` applies unless the latest subscription is
  `canceled`, `incomplete` or `unpaid`; `portalAvailable` is true only for `stripe` with a mirrored
  customer. `apps/app`'s `/api/chat` answers `403 { message: "Upgrade to use chat" }` through the
  chat proxy's `authorize` hook.
- **Limiters unchanged.** The per-inviter (50 per hour) and workspace-creation (10 per hour)
  limiters are 6e's; this phase adds the seat rule only.
- **`form-action` CSP.** `apps/account`'s `src/proxy.ts` passes
  `csp: { "form-action": ["https://checkout.stripe.com", "https://billing.stripe.com"] }`, so the
  Payments actions' redirect to Checkout or the portal is allowed for a plain form post; the
  planner test that keeps `src/proxy.ts` byte-identical across the Next apps exempts `account`.
- **Free's CTA** links to `${siteUrl("auth")}/signup?plan=free` like the paid tiers, not a plain
  sign-up; `apps/auth` still ignores `plan`.

## Components

### `packages/api-contract` — `src/billing.ts`

- `PLAN_KEYS = ["free", "pro", "team"]`, `PlanKey`, `INTERVALS = ["month", "year"]`, `Interval`.
- `FEATURES = ["chat"]`, `Feature`.
- `PLANS: Record<PlanKey, Plan>` with `Plan = { key, name, price: { month: number; year: number }
  /* USD cents, display only */, seatLimit: number | null, features: readonly Feature[] }`:
  - `free`: "Free", 0 / 0, 3 seats, `[]`
  - `pro`: "Pro", 1900 / 19000, 10 seats, `["chat"]`
  - `team`: "Team", 4900 / 49000, unlimited, `["chat"]`
- `BILLING_STATUSES = ["active", "trialing", "past_due", "canceled", "incomplete", "unpaid"]`,
  `BillingStatus` (Stripe's set, verbatim).
- `EntitlementsSchema`: `{ plan: PlanKey, planName, status: BillingStatus | "none", features:
  Feature[], seatLimit: number | null, seatsUsed: number, currentPeriodEnd: iso | null,
  cancelAtPeriodEnd: boolean, interval: Interval | null, portalAvailable: boolean }`.
- `entitlementsFor({ subscription: { plan, interval, status, currentPeriodEnd, cancelAtPeriodEnd }
  | null, memberCount, portalAvailable })`: no subscription, or status `canceled` / `unpaid` /
  `incomplete` → Free; `active` / `trialing` / `past_due` → the subscription's plan (`past_due`
  keeps access; Stripe retries). Pure, table-tested.
- `hasFeature(e, f)`, `seatsLeft(e): number | null`, `SEAT_LIMIT_MESSAGE = "This workspace has
  reached its member limit"`, `FEATURE_MESSAGES = { chat: "Upgrade to use chat" }`.
- Schemas: `CheckoutSchema = WorkspaceIdSchema.extend({ plan: z.enum(["pro","team"]), interval })`,
  `CheckoutUrlSchema = { url: z.string().url() }`, `MockChangeSchema = WorkspaceIdSchema.extend({
  plan: z.enum([...PLAN_KEYS, "cancel"]), interval: optional })`, `BillingSchema =
  EntitlementsSchema.extend({ provider: z.enum(["stripe", "mock"]) })`.
- `WorkspaceSummarySchema` gains `entitlements: EntitlementsSchema` (so `workspaces.list`/`get`
  carry it and no page needs a second call).

### `apps/api`

**Migration `0010_billing`:**
- `billing_customers (workspace_id INTEGER PRIMARY KEY REFERENCES workspaces ON DELETE CASCADE,
  provider TEXT NOT NULL, customer_id TEXT NOT NULL, email TEXT, created_at, updated_at;
  UNIQUE (provider, customer_id))`.
- `billing_subscriptions (id PK, workspace_id REFERENCES workspaces ON DELETE CASCADE, provider,
  subscription_id TEXT NOT NULL, plan TEXT CHECK (plan IN ('pro','team')), interval CHECK
  ('month','year'), status TEXT CHECK (status IN BILLING_STATUSES), current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0, created_at, updated_at; UNIQUE (provider,
  subscription_id); INDEX (workspace_id, updated_at))`.
- `billing_events (id TEXT PRIMARY KEY, provider TEXT NOT NULL, type TEXT NOT NULL, received_at
  TEXT NOT NULL)` — the webhook idempotency ledger.

**Env** (`env.ts`): `BILLING_PROVIDER` (`mock` default | `stripe`); with `stripe`:
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTH`, `STRIPE_PRICE_PRO_YEAR`,
`STRIPE_PRICE_TEAM_MONTH`, `STRIPE_PRICE_TEAM_YEAR` — all six required together (missing → exit at
startup, like `MAIL_PROVIDER`). `BILLING_PROVIDER=mock` in production logs a warning at startup.
`ACCOUNT_URL` (already required) is where checkout/portal return.

**`src/billing/`:**
- `provider.ts` — `BillingProvider { readonly kind: "stripe" | "mock"; createCheckout({
  workspaceId, plan, interval, customerId: string | null, customerEmail, successUrl, cancelUrl })
  → { url }; createPortal({ customerId, returnUrl }) → { url }; cancelSubscription(subscriptionId)
  → void; verifyWebhook(rawBody: string, signatureHeader: string | null) → BillingEvent | null }`;
  `BillingEvent = { id, type, workspaceId: number | null, customerId: string | null,
  customerEmail: string | null, subscription: { subscriptionId, status, plan, interval,
  currentPeriodEnd: string | null, cancelAtPeriodEnd: boolean } | null }`;
  `class BillingSignatureError extends Error`.
- `plans.ts` — `planForPrice(priceId, env) → { plan, interval } | null`, `priceFor(plan,
  interval, env) → string | null`.
- `stripe.ts` — the SDK. Checkout Session: `mode: "subscription"`, `line_items: [{ price, quantity:
  1 }]`, `client_reference_id: String(workspaceId)`, `metadata: { workspaceId }`,
  `subscription_data.metadata.workspaceId`, `customer` when known else `customer_email`,
  `success_url: ${successUrl}` (already carries `?checkout=success`), `cancel_url`. Portal:
  `billingPortal.sessions.create({ customer, return_url })`. `cancelSubscription`:
  `subscriptions.cancel(id)`. `verifyWebhook`: `webhooks.constructEventAsync(rawBody, sig,
  secret)` (default tolerance); reduces `checkout.session.completed` (attribution from
  `metadata.workspaceId` only, customer id + email), `customer.subscription.created|updated|deleted`
  (attribution from `metadata.workspaceId`, else the mirrored customer; price → plan via
  `planForPrice`; an unknown price → `subscription: null` and a log line); any other type → `null`.
- `mock.ts` — default. `createCheckout` writes the mirror in one transaction (customer
  `mock_<workspaceId>`, subscription `mock_sub_<workspaceId>_<n>`, status `active`,
  `current_period_end` now + 1 month/year) and returns `successUrl`; `createPortal` returns
  `returnUrl`; `cancelSubscription` sets status `canceled`; `verifyWebhook` returns `null`.
- `mirror.ts` — `applyBillingEvent(db, event) → { applied: boolean; reason?: "duplicate" |
  "unattributed" | "unknown_price" }`, one transaction: insert into `billing_events` (duplicate →
  not applied), upsert customer, upsert subscription by `(provider, subscription_id)`.
- `entitlements.ts` — `entitlementsForWorkspace(db, workspaceId, provider)`: latest subscription by
  `updated_at` + `memberships` count → `entitlementsFor(...)`; `assertEntitled(e, feature)` and
  `assertSeatAvailable(e)` throw `FORBIDDEN` with the contract's messages.

**Procedures** (`billing` namespace; `member()` as in 6e):

| Procedure | Role | Behaviour |
|---|---|---|
| `billing.get` `[GET /workspaces/{workspaceId}/billing]` | viewer | `BillingSchema` (entitlements + `provider`) |
| `billing.checkout` `[POST …/billing/checkout]` | owner | `{ plan, interval }` → `{ url }`; a non-canceled subscription exists → `CONFLICT` "Use the billing portal to change your plan"; no price configured for the pair → `BAD_REQUEST` "This plan is not available" |
| `billing.portal` `[POST …/billing/portal]` | owner | `{ url }`; no customer → `NOT_FOUND` "No billing account yet" |
| `billing.mockChange` `[POST …/billing/mock]` | owner | `{ plan \| "cancel", interval? }`; provider not `mock` → `NOT_FOUND` |

Return URLs are built by the api from `ACCOUNT_URL`: `${ACCOUNT_URL}/payments?checkout=success`,
`…?checkout=cancelled`, portal `${ACCOUNT_URL}/payments`.

**Where entitlements bite in the api:** `workspaces.invitations.create` and `invitations.accept` /
`acceptById` call `assertSeatAvailable` (members count, pending invitations do not; the invitation
stays pending when acceptance is refused). `workspaces.get` and `workspaces.list` items include
`entitlements`. `workspaces.delete` first calls `provider.cancelSubscription` for a non-canceled
subscription and refuses the delete (`INTERNAL_SERVER_ERROR` logged, message "Could not cancel the
subscription, try again") if that fails, so nobody pays for a deleted workspace; the billing rows
then go with the cascade.

**Webhook route** `POST /billing/webhook` on `Bun.serve`, outside oRPC and outside the bearer
guard: raw body → `verifyWebhook` → `applyBillingEvent` → `200 {"received":true}`; signature
failure → `400`; `null`/unattributed/duplicate → `200` (logged); a database failure → `500` so
Stripe retries. Body limit as the rest of the api.

### `@repo/session`

`requireWorkspace()` returns `{ user, workspace, role, entitlements }` (`entitlements` from the
summary). New `getWorkspaceFromRequest(req)` for route handlers (cookie header → the same
resolution as `currentWorkspace`, no redirect; `null` when none). `hasFeature` / `seatsLeft`
re-exported from the contract.

### `apps/account` — `/payments` goes live

`requireWorkspace()` + `billing.get`. Cards:
- **Plan** — "<Workspace> is on <Plan>", status badge (`Active` / `Trial` / `Past due — update your
  payment method` / `Canceled, ends <date>`), renewal or end date, interval, seats line
  "<used> of <limit> seats used" (or "<used> seats" when unlimited).
- **Change plan** — owner: Free → plan picker (Pro / Team × Monthly / Yearly from `PLANS`, features
  and seat limits listed) + **Continue to checkout** (action `startCheckout` → `billing.checkout` →
  `redirect(url)`); paid → **Manage billing** (`openPortal` → `redirect(url)`). With the mock
  provider the card shows the same picker as an in-app radio group + **Switch plan** / **Cancel
  subscription** (`changeMockPlan` → `billing.mockChange`), labelled "Mock billing — no charges".
  Admins see the card read-only with "Ask an owner to change the plan."
- `?checkout=success|cancelled` → `FormMessage`: "You're on <Plan>." when the mirror already shows
  it, else "Checkout complete — your plan updates within a minute." (the webhook may trail the
  redirect); "Checkout cancelled — nothing changed." The page is dynamic; a reload shows the plan.
- `/workspace` members card gains the seats line and disables the invite form with
  `SEAT_LIMIT_MESSAGE` when full (the api still enforces it).
- Every form a plain `<form action>`; the hidden `workspaceId` guard from 6e applies.

### `apps/app`

- `/chat` page: after `requireWorkspace()`, `hasFeature(entitlements, "chat")` else an upsell
  (`StatusPage`-style: title "Chat is on the Pro plan", description "Upgrade this workspace to use
  it.", link **See plans** → `${ACCOUNT_URL}/payments`); the `/api/chat` route handler checks the
  same through `getWorkspaceFromRequest(req)` and answers `403 { error: "Upgrade to use chat" }`.
- `/notes` header role line unchanged.

### `apps/www`

`src/content/home.tsx` pricing tiers derive from `PLANS` (name, `$<price/100>`, "/month", seat
line, `chat` bullet) — a test asserts the three tiers equal the contract — and the CTAs become
`${siteUrl("auth")}/signup?plan=<key>` (Free: plain sign-up). www stays static. `apps/auth` ignores
`plan` (documented as a hint for a later onboarding step).

### Docs and ops

- `docs/guides/stripe.md`: create the three products/prices, env names, webhook endpoint
  (`https://api.<domain>/billing/webhook`, events to subscribe), local testing with `stripe listen
  --forward-to api.brand.localhost:3007/billing/webhook`, the Customer Portal configuration.
- `.env.example`, `apps/api/.env.example`, `docker-compose.yml` (api service env).
- CLAUDE.md **Billing** paragraph under **Authentication**; env table rows; the ROADMAP's 6d line
  and out-of-scope sentence (payments are in); READMEs (api, session, account, app, www).

## Copy (exact)

`Upgrade to use chat` · `This workspace has reached its member limit` · `Use the billing portal to
change your plan` · `No billing account yet` · `This plan is not available` · `You're on <Plan>.` ·
`Checkout complete — your plan updates within a minute.` · `Checkout cancelled — nothing changed.` ·
`Past due — update your payment method` · `Canceled, ends <date>` · `Mock billing — no charges` ·
`Ask an owner to change the plan.` · `Chat is on the Pro plan` · `Could not cancel the subscription,
try again`.

## Security (review focus)

- The webhook is the only unauthenticated write path: SDK signature verification with the default
  tolerance, replay-safe through `billing_events`, attribution only via the `workspaceId` the api
  placed in the session / subscription metadata or an already-mirrored customer id — never by
  email, and never by `client_reference_id` (end-user settable on Payment Links; written as a label only).
- Checkout/portal/return URLs come from server env; `priceId` never from the client; an
  unconfigured plan/interval is `BAD_REQUEST`.
- `billing.*` mutations are owner-only; `billing.get` viewer; all behind `member()`.
- Entitlements are recomputed from the mirror per request; a cancellation applies on the next
  request after the webhook.
- The mock provider is unreachable under `BILLING_PROVIDER=stripe`; `mock` in production warns at
  startup.
- Seat limits count members only; refusal messages identical for invite and accept.
- Workspace deletion cancels the provider subscription first and refuses on failure.
- The chat gate is enforced server-side in `/api/chat`, not only on the page.

## Tests

- `api-contract`: `entitlementsFor` table (every status × plan; member counts), `hasFeature`,
  `seatsLeft`, `PLANS` invariants (free has no features, limits ascending).
- `apps/api`: `applyBillingEvent` new / update / delete / duplicate / unattributed / unknown price
  (both engines); `billing.*` role gates through the matrix helper; checkout refused with an active
  subscription and for an unconfigured price; mock checkout activates and `billing.get` reflects it;
  mock cancel → Free; seat limit on invite and on accept at the boundary (2 of 3 members + 1 pending
  → accept ok → next accept refused with `SEAT_LIMIT_MESSAGE`; `workspaces.list` shows `seatsUsed`);
  `stripe.ts` payload reduction with a fake Stripe client and `constructEventAsync` against a real
  HMAC fixture (valid, tampered, stale); the webhook route (400 bad signature, 200 duplicate no-op,
  500 on a thrown db error); env: the six-key group, mock warning; delete cancels first.
- `@repo/session`: `requireWorkspace` carries `entitlements`; `getWorkspaceFromRequest`.
- `apps/account` / `apps/app`: action cores with fake apis (`startCheckout`, `openPortal`,
  `changeMockPlan`), the chat page gate and the `/api/chat` 403.
- `apps/www`: pricing content equals `PLANS`.
- Browser pass (mock provider): Free workspace → invite to the limit → refusal → `/payments` picker
  → "checkout" → back with Pro active and the success message → `/chat` opens → invite works → mock
  portal cancel → Free, `/chat` upsell, `/api/chat` 403; zero console/CSP errors; Lighthouse
  accessibility ≥ 95 on `/payments`.

## Out of scope

Per-seat quantities and proration UI; invoices/receipts in-app; taxes and coupons; trials beyond
the price's own; usage metering; several providers at once; `apps/auth` acting on `?plan=`;
dunning emails (Stripe sends its own); admin overrides of a plan (6f).
