// The /v1 handlers: `@repo/public-api-contract` implemented over the same queries, limits,
// realtime publish and product events the internal procedures use. Every read and write is
// scoped to the key's own workspace in SQL, so another workspace's id is simply not found.
import { implement, ORPCError } from "@orpc/server"
import type { ApiScope } from "@repo/api-contract/api-keys-limits"
import { workspaceChannel } from "@repo/api-contract/realtime"
import { publicContract } from "@repo/public-api-contract"
import { recordEvent } from "../analytics/record"
import { entitlementsForWorkspace } from "../billing/entitlements"
import type { BillingProvider } from "../billing/provider"
import type { Db } from "../db"
import type { Enqueue } from "../jobs/enqueue"
import { publishAfterCommit } from "../realtime/after-commit"
import type { Broadcaster } from "../realtime/broadcaster"
import { noteData } from "../webhooks/data"
import { emitWebhookEvent } from "../webhooks/emit"
import { NOTE_NOT_FOUND_MESSAGE, scopeMessage, UNAUTHORIZED_MESSAGE } from "./errors"
import type { V1Key } from "./guard"
import { toV1Note } from "./note"

export type V1Context = {
  db: Db
  now: () => Date
  billing: Pick<BillingProvider, "kind">
  enqueue: Enqueue
  recordFailure: (message: string, error: unknown) => void
  broadcaster: Broadcaster
  /** The key the guard resolved; null only for the open spec and docs routes. */
  key: V1Key | null
}

// Input is validated after every middleware (not before the first), so the key and scope checks
// below answer 401/403 whatever the body or path holds; only then is a bad input a 400.
const os = implement(publicContract, {
  initialInputValidationIndex: Number.POSITIVE_INFINITY,
}).$context<V1Context>()

// The guard has already refused a request without a valid key; this keeps a procedure from ever
// running without one, whatever route reaches it.
const keyed = os.use(({ context, next }) => {
  if (!context.key) throw new ORPCError("UNAUTHORIZED", { message: UNAUTHORIZED_MESSAGE })
  return next({ context: { key: context.key } })
})

/** `forbidden_scope`, naming the scope, unless the key carries it. Runs before input validation. */
const scope = (needed: ApiScope) =>
  os.middleware(({ context, next }) => {
    if (!context.key?.scopes.includes(needed))
      throw new ORPCError("FORBIDDEN", { message: scopeMessage(needed) })
    return next()
  })

export const v1Router = os.router({
  workspace: {
    get: keyed.workspace.get.use(scope("workspace:read")).handler(async ({ context }) => {
      const workspace = await context.db.workspaces.find(context.key.workspaceId)
      // Only a race reaches this: the workspace (and with it the key) was deleted after the guard
      // let the request through. Answer what the guard answers for a deleted workspace, the
      // declared 401, rather than an undeclared 404.
      if (!workspace) throw new ORPCError("UNAUTHORIZED", { message: UNAUTHORIZED_MESSAGE })
      const { plan } = await entitlementsForWorkspace(context.db, workspace.id, context.billing)
      return { id: Number(workspace.id), name: workspace.name, slug: workspace.slug, plan }
    }),
  },

  members: {
    list: keyed.members.list.use(scope("members:read")).handler(async ({ input, context }) => {
      const { rows, nextCursor } = await context.db.memberships.page({
        workspaceId: context.key.workspaceId,
        cursor: input.cursor,
        limit: input.limit,
      })
      return {
        items: rows.map((row) => ({
          userId: row.user_id,
          name: row.name,
          role: row.role,
          joinedAt: row.created_at,
        })),
        nextCursor,
      }
    }),
  },

  notes: {
    list: keyed.notes.list.use(scope("notes:read")).handler(async ({ input, context }) => {
      const { rows, nextCursor } = await context.db.notes.page({
        workspaceId: context.key.workspaceId,
        cursor: input.cursor,
        limit: input.limit,
      })
      return { items: rows.map(toV1Note), nextCursor }
    }),

    get: keyed.notes.get.use(scope("notes:read")).handler(async ({ input, context }) => {
      const row = await context.db.notes.findDetail({
        workspaceId: context.key.workspaceId,
        id: input.id,
      })
      if (!row) throw new ORPCError("NOT_FOUND", { message: NOTE_NOT_FOUND_MESSAGE })
      return toV1Note(row)
    }),

    // Authored by the key (`notes.api_key_id`), never a person: `note_created` carries no user.
    create: keyed.notes.create.use(scope("notes:write")).handler(async ({ input, context }) => {
      const { key } = context
      // The note and its webhook deliveries commit together, or neither does.
      const note = await context.db.transaction(async (tx) => {
        const created = await tx.notes.create({
          workspaceId: key.workspaceId,
          apiKey: { id: key.id, name: key.name },
          title: input.title,
          body: input.body,
        })
        await emitWebhookEvent(
          context,
          key.workspaceId,
          "note.created",
          () => noteData(tx, { workspaceId: key.workspaceId, id: created.id }),
          { tx }
        )
        return created
      })
      await recordEvent(context, "note_created", { userId: null, workspaceId: key.workspaceId }, {})
      // The transaction has committed by now (see publishAfterCommit).
      publishAfterCommit(context, workspaceChannel(key.workspaceId), {
        type: "note.created",
        note,
      })
      return {
        id: note.id,
        title: note.title,
        body: note.body,
        createdAt: note.createdAt,
        author: { type: "api_key" as const, id: key.id, name: key.name },
      }
    }),

    delete: keyed.notes.delete.use(scope("notes:write")).handler(async ({ input, context }) => {
      const noteKey = { workspaceId: context.key.workspaceId, id: input.id }
      const deleted = await context.db.transaction(async (tx) => {
        if (!(await tx.notes.delete(noteKey))) return false
        await emitWebhookEvent(
          context,
          noteKey.workspaceId,
          "note.deleted",
          { id: input.id },
          { tx }
        )
        return true
      })
      if (!deleted) throw new ORPCError("NOT_FOUND", { message: NOTE_NOT_FOUND_MESSAGE })
      publishAfterCommit(context, workspaceChannel(context.key.workspaceId), {
        type: "note.deleted",
        id: input.id,
      })
    }),
  },
})
