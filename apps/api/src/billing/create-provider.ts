import type { Db } from "../db"
import type { Env } from "../env"
import type { Enqueue } from "../jobs/enqueue"
import type { NotificationEmailDeps } from "../notification-email"
import type { Broadcaster } from "../realtime/broadcaster"
import { mockProvider } from "./mock"
import type { PriceEnv } from "./plans"
import type { BillingProvider } from "./provider"
import { stripeBilling } from "./stripe"

export type BillingFactory = (deps: {
  db: Db
  log: (message: string, error: unknown) => void
  /** Base URL of the account app (the Payments page), for checkout and portal return links. */
  accountUrl: string
  /** For the mock's "checkout"/"change", which record `plan_changed` through the mirror. */
  enqueue: Enqueue
  recordFailure: (message: string, error: unknown) => void
  /** For the owners' `plan.changed` notifications the mock's changes write through the mirror. */
  broadcaster: Broadcaster
  /** …and their `plan.changed` emails: the links' base URLs and the unsubscribe key. */
  notificationEmail: Omit<NotificationEmailDeps, "enqueue">
}) => BillingProvider
export const mockBilling: BillingFactory = ({
  db,
  enqueue,
  recordFailure,
  broadcaster,
  notificationEmail,
}) => mockProvider(db, { enqueue, recordFailure, broadcaster, notificationEmail })

/** The slice of `Env` billing reads (a full `Env` satisfies it). */
export type BillingEnv = PriceEnv & {
  BILLING_PROVIDER: Env["BILLING_PROVIDER"]
  STRIPE_SECRET_KEY?: string
  STRIPE_WEBHOOK_SECRET?: string
}

/** Picks the provider by BILLING_PROVIDER: the keyless mock unless it says stripe. */
export function createBillingFactory(env: BillingEnv): BillingFactory {
  if (env.BILLING_PROVIDER !== "stripe") return mockBilling
  const { STRIPE_SECRET_KEY: secretKey, STRIPE_WEBHOOK_SECRET: webhookSecret } = env
  // Unreachable after loadEnv, which refuses BILLING_PROVIDER=stripe without every key.
  if (!secretKey || !webhookSecret) {
    throw new Error("BILLING_PROVIDER=stripe needs STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET")
  }
  return ({ log }) => stripeBilling({ secretKey, webhookSecret, prices: env, log })
}
