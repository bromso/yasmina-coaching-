import { z } from "zod"

/** The path parameter every workspace-scoped procedure takes. Its own module so `workspace.ts` and `billing.ts` can both import it without a cycle. */
export const WorkspaceIdSchema = z.object({ workspaceId: z.coerce.number().int().positive() })
