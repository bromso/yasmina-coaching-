import { z } from "zod"
import {
  WORKSPACE_ACTIVITY_ACTIONS,
  WORKSPACE_ACTIVITY_CURSOR_PATTERN,
  WORKSPACE_ACTIVITY_MAX_PAGE_SIZE,
  WORKSPACE_ACTIVITY_PAGE_SIZE,
  WORKSPACE_ACTIVITY_TARGET_TYPES,
} from "./workspace-activity"

// The `workspaces.activity.list` shapes. Kept apart from the dependency-free
// `./workspace-activity` (which a client component may import) because these need zod.

/** A cursor whose shape is valid and whose time and id are real values. */
const isCursor = (value: string) => {
  const match = WORKSPACE_ACTIVITY_CURSOR_PATTERN.exec(value)
  if (!match) return false
  const [, at, id] = match
  // An impossible date (month 13) is an Invalid Date, whose toISOString throws: check it first.
  const date = new Date(at as string)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString() === at && Number(id) <= 2_147_483_647 // a 32-bit id
  )
}

export const WorkspaceActivityListSchema = z.object({
  workspaceId: z.coerce.number().int().positive(),
  cursor: z.string().max(40).refine(isCursor, "Invalid cursor").optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(WORKSPACE_ACTIVITY_MAX_PAGE_SIZE)
    .default(WORKSPACE_ACTIVITY_PAGE_SIZE),
  /** Only rows of this action; anything outside `WORKSPACE_ACTIVITY_ACTIONS` is a 400. */
  action: z.enum(WORKSPACE_ACTIVITY_ACTIONS).optional(),
})

/** Who did it. Platform staff are never named: an impersonated action is the member, `bySupport`. */
export const WorkspaceActivityActorSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("member"),
    userId: z.number().int(),
    name: z.string(),
    /** A current member's address (every caller is admin or up); null for a former member. */
    email: z.string().nullable(),
    bySupport: z.boolean(),
  }),
  z.object({ kind: z.literal("apiKey"), id: z.number().int(), name: z.string() }),
  z.object({ kind: z.literal("system") }),
  z.object({ kind: z.literal("deleted") }),
])
export type WorkspaceActivityActor = z.infer<typeof WorkspaceActivityActorSchema>

/** What it was done to: a member's current name, a key's name or an endpoint's host as `label`. */
export const WorkspaceActivityTargetSchema = z.object({
  type: z.enum(WORKSPACE_ACTIVITY_TARGET_TYPES),
  id: z.string(),
  label: z.string().nullable(),
})

/** The display allowlist (design §2): every other stored metadata key is dropped. */
export const WorkspaceActivityDetailsSchema = z.object({
  name: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  role: z.string().optional(),
  /** Always masked (`a***@example.com`): stored that way. */
  email: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  host: z.string().optional(),
  events: z.array(z.string()).optional(),
  plan: z.string().optional(),
  interval: z.string().optional(),
  status: z.string().optional(),
  /** `workspace.webhook_disabled` only. */
  reason: z.enum(["failures", "gone"]).optional(),
  /** `workspace.two_factor_requirement_changed` only: whether the requirement was turned on. */
  enabled: z.boolean().optional(),
  /** `workspace.invite_domains_changed` only: the domains the change added and removed. */
  added: z.array(z.string()).optional(),
  removed: z.array(z.string()).optional(),
})
export type WorkspaceActivityDetails = z.infer<typeof WorkspaceActivityDetailsSchema>

export const WorkspaceActivityItemSchema = z.object({
  id: z.number().int(),
  at: z.string(),
  action: z.enum(WORKSPACE_ACTIVITY_ACTIONS),
  actor: WorkspaceActivityActorSchema,
  target: WorkspaceActivityTargetSchema.nullable(),
  details: WorkspaceActivityDetailsSchema,
})
export type WorkspaceActivityItem = z.infer<typeof WorkspaceActivityItemSchema>

export const WorkspaceActivityPageSchema = z.object({
  items: z.array(WorkspaceActivityItemSchema),
  /** Pass back as `cursor` for the next (older) page; null on the last one. */
  nextCursor: z.string().nullable(),
})
export type WorkspaceActivityPage = z.infer<typeof WorkspaceActivityPageSchema>
