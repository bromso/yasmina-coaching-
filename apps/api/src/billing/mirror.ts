import { type BillingStatus, entitlementsFor, type PlanKey } from "@repo/api-contract"
import { auditWorkspace, type WorkspaceAuditContext } from "../admin"
import { noopEvents, type RecordEventContext, recordEvent } from "../analytics/record"
import type { Db } from "../db"
import type { NotificationEmailDeps } from "../notification-email"
import { isActor, notifyUser } from "../notifications"
import type { SubscriptionRow } from "../queries/billing"
import type { Broadcaster } from "../realtime/broadcaster"
import type { BillingEvent } from "./provider"

export type ApplyResult = {
  applied: boolean
  reason?:
    | "duplicate"
    | "unattributed"
    | "unknown_price"
    | "conflict"
    | "gone"
    | "stale"
    | "customer_changed"
}

const LIVE: readonly BillingStatus[] = ["active", "trialing", "past_due"]

/**
 * The mirror's side effects: the `plan_changed` product event and, given a `broadcaster` and
 * `notificationEmail`, a `plan.changed` notification for each owner (emailed too, per owner, when
 * their setting is on). Every real caller (the mock provider and the provider webhook) passes
 * both; a test that only checks the mirror may leave them out.
 */
export type MirrorEvents = RecordEventContext & {
  broadcaster?: Broadcaster
  /** Where an owner's `plan.changed` email links to, and the unsubscribe token's key. */
  notificationEmail?: Omit<NotificationEmailDeps, "enqueue">
}

/**
 * Free vs. a paid plan, by `entitlementsFor`'s own rule (a live status keeps the plan, anything
 * else is free) — never the raw `plan` column: a canceled row still holds its old plan, and an
 * `incomplete` one was never paid, so comparing columns directly (the bug this reuse avoids)
 * misses a cancellation, a re-checkout that reuses the old subscription id, and more.
 */
function effectivePlan(row: SubscriptionRow | undefined): PlanKey {
  return entitlementsFor({
    subscription: row
      ? {
          plan: row.plan,
          interval: row.interval,
          status: row.status,
          currentPeriodEnd: row.current_period_end,
          cancelAtPeriodEnd: Boolean(Number(row.cancel_at_period_end)),
        }
      : null,
    memberCount: 0,
    portalAvailable: false,
  }).plan
}

/**
 * Writes what a verified event says, once. The event id is recorded first inside the same
 * transaction, so a redelivery (Stripe retries, two replicas) never double-applies.
 *
 * A change of effective plan (or of a live plan's interval) records `workspace.plan_changed` in
 * the same transaction, actored by `actor`: the caller for the mock's in-app change and checkout,
 * nobody (the system) for a provider webhook — the default. `null` records nothing: the mock's
 * cancellation ahead of deleting the workspace (a real provider's arrives once it is gone).
 */
export async function applyBillingEvent(
  db: Db,
  provider: string,
  event: BillingEvent,
  events: MirrorEvents = noopEvents,
  actor: Omit<WorkspaceAuditContext, "db"> | null = {}
): Promise<ApplyResult> {
  return db.transaction(async (tx) => {
    const fresh = await tx.billing.events.record(event.id, provider, event.type)
    if (!fresh) return { applied: false, reason: "duplicate" }
    const mirrored = event.customerId
      ? await tx.billing.customers.findByCustomerId(provider, event.customerId)
      : undefined
    // Attribution: the workspace id we put on the checkout, else a customer we already mirrored.
    const workspaceId = event.workspaceId ?? mirrored?.workspace_id ?? null
    if (workspaceId === null) return { applied: false, reason: "unattributed" }
    // One provider customer belongs to one workspace (UNIQUE (provider, customer_id)). An event
    // naming another workspace for it would fail the upsert, roll back the event record and be
    // retried forever; record it as a conflict instead and leave both workspaces as they are.
    if (mirrored && Number(mirrored.workspace_id) !== Number(workspaceId)) {
      return { applied: false, reason: "conflict" }
    }
    // A workspace deleted since checkout: the writes below would fail its foreign key, roll back
    // the event record and be retried forever. Record it as gone instead.
    const workspace = await tx.workspaces.find(workspaceId)
    if (!workspace) return { applied: false, reason: "gone" }
    if (event.customerId) {
      const customer = {
        workspaceId,
        provider,
        customerId: event.customerId,
        email: event.customerEmail,
      }
      const current = await tx.billing.customers.find(workspaceId)
      if (current && (current.customer_id !== event.customerId || current.provider !== provider)) {
        // Another customer for a workspace that already has one. While its subscription is live
        // that is never a legitimate switch: keep the customer the portal and checkout use.
        // Once nothing is live it is a new checkout under a new customer: follow it.
        const live = await tx.billing.subscriptions.latest(workspaceId)
        if (live && LIVE.includes(live.status))
          return { applied: false, reason: "customer_changed" }
        await tx.billing.customers.replace(customer)
      } else {
        await tx.billing.customers.upsert(customer)
      }
    }
    if (event.unknownPrice) return { applied: false, reason: "unknown_price" }
    if (event.subscription) {
      // The workspace's effective subscription before this event — `subscriptions.latest`, the
      // row `entitlementsForWorkspace` (and so `workspaces.get`) reads — in the same transaction,
      // so "before" vs "after" never races the write. Per workspace, not per subscription: a
      // workspace that moved to a new subscription and then sees its old one canceled still has
      // its plan, and that cancellation is no plan change.
      const before = await tx.billing.subscriptions.latest(workspaceId)
      const written = await tx.billing.subscriptions.upsert({
        workspaceId,
        provider,
        ...event.subscription,
        sourceUpdatedAt: event.createdAt,
      })
      // An older event than the one the row reflects (a retry landing late): keep the newer
      // state, and record nothing — a redelivery or a stale replay changes nothing either way.
      if (!written) return { applied: false, reason: "stale" }
      const after = await tx.billing.subscriptions.latest(workspaceId)
      const planBefore = effectivePlan(before)
      const planAfter = effectivePlan(after)
      // Same plan, still live, different billing interval (month ↔ year): a change worth
      // recording even though the plan name itself did not move.
      const intervalChangedOnLivePlan =
        planAfter !== "free" &&
        before !== undefined &&
        after !== undefined &&
        LIVE.includes(before.status) &&
        before.interval !== after.interval
      if (planBefore !== planAfter || intervalChangedOnLivePlan) {
        await recordEvent(
          events,
          "plan_changed",
          { userId: null, workspaceId },
          // `planAfter` is "free" for a cancellation. The interval is the effective row's, else
          // whatever the event carries (Stripe always sends one, even on cancellation).
          { plan: planAfter, interval: after?.interval ?? event.subscription.interval },
          { tx }
        )
        if (actor)
          await auditWorkspace({ ...actor, db: tx }, workspaceId, {
            action: "workspace.plan_changed",
            targetType: "workspace",
            targetId: workspaceId,
            metadata: {
              plan: planAfter,
              interval: after?.interval ?? event.subscription.interval,
              status: after?.status ?? event.subscription.status,
            },
          })
        // Each owner but the one who made the change (the mock's in-app change and checkout); a
        // provider webhook has no actor, so every owner. `null` (a cancellation right before the
        // workspace is deleted) tells nobody, like the activity log. An interval-only change
        // (Pro monthly → Pro yearly) tells nobody either: the notification names only the plan,
        // so it would read "plan changed to Pro" when the plan did not change.
        const { broadcaster, notificationEmail } = events
        if (actor && broadcaster && notificationEmail && planBefore !== planAfter) {
          for (const member of await tx.memberships.list(workspaceId)) {
            if (member.role !== "owner" || isActor(actor, member.user_id)) continue
            await notifyUser(
              {
                db: tx,
                broadcaster,
                recordFailure: events.recordFailure,
                enqueue: events.enqueue,
                ...notificationEmail,
              },
              member.user_id,
              "plan.changed",
              { workspaceName: workspace.name, plan: planAfter },
              { tx, workspaceId }
            )
          }
        }
      }
    }
    return { applied: true }
  })
}
