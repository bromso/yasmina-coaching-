// The public /v1 REST contract: what an API-key holder can call on apps/api. Its own schemas on
// purpose — never the internal procedures' — so the internal contract can change freely while
// /v1 stays stable. The rule (see README): /v1 only ever gains fields and routes; anything that
// would break an existing caller is /v2.
import { type ContractRouterClient, oc } from "@orpc/contract"
import { z } from "zod"

/** What a key may do; a key carries at least one. */
export const SCOPES = ["workspace:read", "members:read", "notes:read", "notes:write"] as const
export type Scope = (typeof SCOPES)[number]

/** Every error answers `{ error: { code, message } }` with one of these codes. */
export const ERROR_CODES = [
  "unauthorized",
  "forbidden_scope",
  "not_found",
  "validation_failed",
  "rate_limited",
  "internal",
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

/** The HTTP status each error code answers with. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden_scope: 403,
  not_found: 404,
  validation_failed: 400,
  rate_limited: 429,
  internal: 500,
}

export const ErrorBodySchema = z.object({
  error: z.object({ code: z.enum(ERROR_CODES), message: z.string() }),
})
export type ErrorBody = z.infer<typeof ErrorBodySchema>

export const DEFAULT_LIMIT = 25
export const MAX_LIMIT = 100

/** `?cursor&limit`: the cursor is the last id of the previous page (`nextCursor`). */
export const PageQuerySchema = z.object({
  cursor: z.coerce
    .number()
    .int()
    .positive()
    .optional()
    .describe("The previous page's `nextCursor`; leave it out for the first page."),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .default(DEFAULT_LIMIT)
    .describe("How many items to return."),
})
export type PageQuery = z.input<typeof PageQuerySchema>

const nextCursor = z
  .number()
  .int()
  .positive()
  .nullable()
  .describe("Pass it as `cursor` to fetch the next page; `null` on the last page.")
const id = z.number().int().positive()

export const PLANS = ["free", "pro", "team"] as const
export const ROLES = ["viewer", "member", "admin", "owner"] as const

export const WorkspaceSchema = z.object({
  id: id.describe("The workspace's id."),
  name: z.string().describe("The workspace's name."),
  slug: z
    .string()
    .describe("A URL-friendly name, set when the workspace is created; it never changes."),
  plan: z.enum(PLANS).describe("The workspace's current billing plan."),
})
export type Workspace = z.infer<typeof WorkspaceSchema>

/** A member: never an email address. */
export const MemberSchema = z.object({
  userId: id.describe("The member's user id."),
  name: z.string().describe("The member's display name."),
  role: z.enum(ROLES).describe("The member's role in the workspace."),
  joinedAt: z.iso.datetime().describe("When the member joined the workspace."),
})
export type Member = z.infer<typeof MemberSchema>

export const MemberPageSchema = z.object({
  items: z.array(MemberSchema).describe("This page's members, ordered by user id."),
  nextCursor,
})
export type MemberPage = z.infer<typeof MemberPageSchema>

/** Who wrote a note: a person, an API key, or null once the person's account is gone. */
const authorId = id.describe("The person's user id, or the API key's id.")
const authorName = z.string().describe("The person's display name, or the API key's name.")
const authorType = "Who wrote the note: a person (`user`) or an API key (`api_key`)."
export const AuthorSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("user").describe(authorType), id: authorId, name: authorName }),
  z.object({ type: z.literal("api_key").describe(authorType), id: authorId, name: authorName }),
])
export type Author = z.infer<typeof AuthorSchema>

export const NoteSchema = z.object({
  id: id.describe("The note's id."),
  title: z.string().describe("The note's title."),
  body: z.string().describe("The note's text; empty when it has none."),
  createdAt: z.iso.datetime().describe("When the note was created."),
  author: AuthorSchema.nullable().describe(
    "Who wrote the note; `null` once the person's account is deleted."
  ),
})
export type Note = z.infer<typeof NoteSchema>

export const NotePageSchema = z.object({
  items: z.array(NoteSchema).describe("This page's notes, newest first."),
  nextCursor,
})
export type NotePage = z.infer<typeof NotePageSchema>

export const CreateNoteSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe(
      "The note's title. Leading and trailing spaces are trimmed first; what is left must be 1-200 characters."
    ),
  body: z.string().max(10_000).default("").describe("The note's text."),
})
export type CreateNote = z.input<typeof CreateNoteSchema>

export const NoteIdSchema = z.object({
  id: z.coerce.number().int().positive().describe("The note's id."),
})

// Declared so the generated spec documents each error response (in the shape above), exactly the
// ones a route can answer. Every route: the API-key guard's 401 and 429, the scope check's 403, an
// unexpected failure's 500, and a request past the server's deadline, 503 (both `internal`).
const AUTH_ERRORS = {
  UNAUTHORIZED: { message: "Invalid or missing API key" },
  FORBIDDEN: { message: "This API key lacks the scope this route needs" },
  TOO_MANY_REQUESTS: { message: "Too many requests" },
  INTERNAL_SERVER_ERROR: { message: "Internal error" },
  SERVICE_UNAVAILABLE: { status: 503, message: "The request took too long" },
} as const
/** A route with parameters or a body: input that fails its schema is 400 `validation_failed`. */
const INPUT_ERRORS = {
  ...AUTH_ERRORS,
  BAD_REQUEST: { message: "Input validation failed" },
} as const
/** A route addressing one note by id: 404 `not_found` when it is not in the key's workspace. */
const NOT_FOUND_ERRORS = { ...INPUT_ERRORS, NOT_FOUND: { message: "Not found" } } as const
/** A route that takes a body: one over the size cap is 413 `validation_failed`. */
const BODY_ERRORS = {
  ...INPUT_ERRORS,
  PAYLOAD_TOO_LARGE: { status: 413, message: "Payload too large" },
} as const

const tags = (tag: string) => [tag]

/**
 * Stamps the route's required scope as `x-required-scope`, a machine-readable extension next to
 * the prose in `summary`/`description`. The generator's `spec` hook receives the fully computed
 * operation object (parameters, request/response bodies, errors already resolved) and this only
 * adds to it — nothing above is replaced. Cast through `never` the way `customErrorResponseBodySchema`
 * below is: the extension field has no place in `OpenAPIV3_1.OperationObject`'s default type.
 */
const requiredScope = (scope: Scope) =>
  ((current: Record<string, unknown>) => ({
    ...current,
    "x-required-scope": scope,
  })) as never

export const publicContract = {
  workspace: {
    get: oc
      .route({
        method: "GET",
        path: "/v1/workspace",
        operationId: "getWorkspace",
        summary: "Get the workspace",
        description:
          "Returns the API key's workspace: its id, name, slug and current billing plan. " +
          "Requires the `workspace:read` scope.",
        tags: tags("Workspace"),
        spec: requiredScope("workspace:read"),
      })
      .errors(AUTH_ERRORS)
      .input(z.object({}))
      .output(WorkspaceSchema),
  },
  members: {
    list: oc
      .route({
        method: "GET",
        path: "/v1/members",
        operationId: "listMembers",
        summary: "List members",
        description:
          "Lists the workspace's members, ordered by user id. Supports cursor pagination: pass " +
          "`cursor` (the previous page's `nextCursor`) and `limit` (1-100, default 25); " +
          "`nextCursor` is `null` on the last page. Never includes an email address. Requires " +
          "the `members:read` scope.",
        tags: tags("Members"),
        spec: requiredScope("members:read"),
      })
      .errors(INPUT_ERRORS)
      .input(PageQuerySchema)
      .output(MemberPageSchema),
  },
  notes: {
    list: oc
      .route({
        method: "GET",
        path: "/v1/notes",
        operationId: "listNotes",
        summary: "List notes",
        description:
          "Lists the workspace's notes, newest first. Supports cursor pagination: pass " +
          "`cursor` (the previous page's `nextCursor`) and `limit` (1-100, default 25); " +
          "`nextCursor` is `null` on the last page. Requires the `notes:read` scope.",
        tags: tags("Notes"),
        spec: requiredScope("notes:read"),
      })
      .errors(INPUT_ERRORS)
      .input(PageQuerySchema)
      .output(NotePageSchema),
    get: oc
      .route({
        method: "GET",
        path: "/v1/notes/{id}",
        operationId: "getNote",
        summary: "Get a note",
        description:
          "Returns one note by id. Answers `not_found` if the note does not exist or belongs " +
          "to a different workspace. Requires the `notes:read` scope.",
        tags: tags("Notes"),
        spec: requiredScope("notes:read"),
      })
      .errors(NOT_FOUND_ERRORS)
      .input(NoteIdSchema)
      .output(NoteSchema),
    create: oc
      .route({
        method: "POST",
        path: "/v1/notes",
        successStatus: 201,
        operationId: "createNote",
        summary: "Create a note",
        description:
          "Creates a note authored by the API key. `title` is required, 1-200 characters " +
          "once leading and trailing spaces are trimmed (it is stored trimmed); " +
          "`body` is optional, up to 10,000 characters, and defaults to an empty string. " +
          "Requires the `notes:write` scope.",
        tags: tags("Notes"),
        spec: requiredScope("notes:write"),
      })
      .errors(BODY_ERRORS)
      .input(CreateNoteSchema)
      .output(NoteSchema),
    delete: oc
      .route({
        method: "DELETE",
        path: "/v1/notes/{id}",
        successStatus: 204,
        operationId: "deleteNote",
        summary: "Delete a note",
        description:
          "Deletes one note by id. Answers `not_found` if the note does not exist or belongs " +
          "to a different workspace. Requires the `notes:write` scope.",
        tags: tags("Notes"),
        spec: requiredScope("notes:write"),
      })
      .errors(NOT_FOUND_ERRORS)
      .input(NoteIdSchema)
      .output(z.void()),
  },
}

export type PublicContract = typeof publicContract
export type PublicApiClient = ContractRouterClient<PublicContract>
