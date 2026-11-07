# Setting up Stripe billing

Billing runs on the keyless **mock** until you switch it. `apps/api` reads `BILLING_PROVIDER`
(`src/env.ts`): unset or `mock` keeps the mock; `stripe` turns Stripe on and then needs **all six**
`STRIPE_*` variables below — a missing one stops the api at startup, naming it.

The secret key and the webhook secret live only in `apps/api`. The Next apps never see them: the
Payments page asks the api for a Checkout or Customer Portal URL and redirects the browser there,
and Stripe reports back to the api's webhook, which mirrors the subscription into the database.
Entitlements are read from that mirror, never from Stripe on a request.

## Where the values go

| Running | File |
|---|---|
| `bun dev` / `bun --filter @repo/api dev` | `apps/api/.env` (copy `apps/api/.env.example`) |
| `docker compose up` | the root `.env` (copy `.env.example`); `docker-compose.yml` passes `BILLING_PROVIDER` and the six `STRIPE_*` vars to `api` |
| Production | the api service's environment |

| Variable | Value |
|---|---|
| `BILLING_PROVIDER` | `stripe` |
| `STRIPE_SECRET_KEY` | **Developers → API keys** → secret key (`sk_test_…` / `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | the webhook endpoint's signing secret (`whsec_…`), see below |
| `STRIPE_PRICE_PRO_MONTH` | the Pro monthly price id (`price_…`) |
| `STRIPE_PRICE_PRO_YEAR` | the Pro yearly price id |
| `STRIPE_PRICE_TEAM_MONTH` | the Team monthly price id |
| `STRIPE_PRICE_TEAM_YEAR` | the Team yearly price id |

Use a sandbox (test mode) for everything below first; live mode needs the same steps again with
live keys, live prices and a live webhook endpoint.

## 1. Products and prices

Prices live in Stripe, never in code: the api only maps the four price ids back to a plan and
interval.

1. **Product catalog → Add product**: name it **Pro**. Add a **recurring** price, billed
   **monthly**, then a second recurring price on the same product, billed **yearly**.
2. Do the same for a product named **Team**.
3. Open each price and copy its id (`price_…`) into the matching `STRIPE_PRICE_*` variable.

A subscription whose price is none of the four (a price created later, or one from another
product) is not mirrored: the api logs `stripe: unknown price on sub_…` and the webhook answers
`applied: false, reason: "unknown_price"`. Add the price id to the env and restart to sell it.

## 2. The webhook endpoint

The api's webhook is `POST /billing/webhook`. It takes no bearer token — Stripe sends none; the
`Stripe-Signature` header over the raw body is the authentication, checked with
`STRIPE_WEBHOOK_SECRET`.

1. **Developers → Webhooks → Add destination** (or **Add endpoint**), account events.
2. **Endpoint URL**: `https://api.<your-domain>/billing/webhook`.
3. **Events**: select exactly these four:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Save, open the endpoint, **reveal the signing secret** and copy it into `STRIPE_WEBHOOK_SECRET`.

How the api answers, so you can read the endpoint's delivery log:

| Response | Meaning | Stripe retries? |
|---|---|---|
| `400 {"error":"Bad signature"}` | missing or invalid signature, or older than 5 minutes (check the secret) | yes |
| `200 {"received":true,"ignored":true}` | an event type the api does not use | no |
| `200 {"received":true,"applied":true}` | mirrored | no |
| `200 … "applied":false,"reason":"duplicate"` | this event id was already applied (a redelivery) | no |
| `200 … "reason":"unattributed"` | no workspace on the event and an unknown customer | no |
| `200 … "reason":"unknown_price"` | see **Products and prices** | no |
| `200 … "reason":"conflict"` | the customer is already mirrored to a different workspace | no |
| `200 … "reason":"gone"` | the workspace was deleted since checkout | no |
| `200 … "reason":"stale"` | older than the event the subscription row already reflects (a late retry) | no |
| `200 … "reason":"customer_changed"` | a different customer for a workspace whose subscription is still live; the mirrored customer is kept | no |
| `500 {"error":"Internal error"}` | the api or its database failed; the api logs why | yes |

Every event is attributed to a workspace through the workspace id the api puts in the Checkout
Session's `metadata.workspaceId` and on the subscription (`subscription_data.metadata.workspaceId`),
falling back to a customer it already mirrored. The session's `client_reference_id` carries the
same id as a label only: customers can set it themselves on Payment Links, so it is never trusted.
Sessions created outside the api (Payment Links, the dashboard) carry no `metadata.workspaceId`
and are answered `unattributed`.
Subscriptions created by hand in the dashboard carry no workspace id, so they are only mirrored
for a customer the api already knows.

A `past_due` subscription keeps its plan while Stripe retries the payment, until your dunning
settings end the subscription (**Settings → Subscriptions and emails → Manage failed payments**);
the resulting `customer.subscription.updated` / `deleted` moves the workspace to Free.

The webhook's body is held to `API_MAX_BODY_BYTES` (256 KiB by default) like every non-upload
request. Stripe's events are far smaller, but if one is ever refused with `413` (Stripe's delivery
log shows it, and Stripe keeps retrying), raise `API_MAX_BODY_BYTES` on the api.

## 3. Customer Portal

The Payments page sends paying workspaces to Stripe's hosted Customer Portal to change plan,
update the card, see invoices or cancel.

1. **Settings → Billing → Customer portal** (test mode has its own configuration).
2. **Subscriptions → Customers can switch plans**: on, and add **Pro** and **Team** with both of
   their prices, so a customer can move between the two products and intervals.
3. **Customers can cancel subscriptions**: on. Choose *at end of billing period* to keep the plan
   until the period ends (the Payments page shows the cancellation date) or *immediately*.
4. **Save**. A plan switch or cancellation arrives as `customer.subscription.updated` /
   `customer.subscription.deleted`, which the webhook mirrors like any other change.

## Local testing

Stripe cannot reach `api.brand.localhost`, so forward events with the
[Stripe CLI](https://docs.stripe.com/stripe-cli):

```bash
stripe login
stripe listen --forward-to api.brand.localhost:3007/billing/webhook \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted
```

`stripe listen` prints `Your webhook signing secret is whsec_…`. Put **that** value in
`apps/api/.env` as `STRIPE_WEBHOOK_SECRET` (it is not the dashboard endpoint's secret) and restart
the api. Keep `stripe listen` running while you test; the forwarded deliveries and the api's
answers appear in its output.

Under `docker compose up`, forward to `localhost:3007/billing/webhook` instead.

Pay in Checkout with Stripe's [test cards](https://docs.stripe.com/testing), any future expiry,
any CVC and postal code:

| Card | Result |
|---|---|
| `4242 4242 4242 4242` | succeeds |
| `4000 0025 0000 3155` | asks for 3-D Secure authentication |
| `4000 0000 0000 9995` | declined (insufficient funds) |

`stripe trigger customer.subscription.updated` sends a synthetic event too, but its subscription
has no workspace id and a price the api does not know, so expect `unattributed` or
`unknown_price` rather than a mirrored change.

## What the mock does instead

With `BILLING_PROVIDER=mock` (the default) there is no Stripe, no keys and no webhook:

- **Checkout** activates the chosen plan at once and returns straight to the Payments page — no
  payment is taken.
- **Plan changes and cancellation** happen on the Payments page itself; there is no Customer
  Portal.
- It writes through the same mirror as Stripe's webhook (provider `mock`), so entitlements, seat
  limits and the plan badge behave exactly as they will with Stripe.

That makes it right for development, demos and tests, and wrong for production: with
`NODE_ENV=production` the api warns at startup that plans activate without payment.
