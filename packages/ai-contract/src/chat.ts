import { type InferUITools, tool, type UIMessage } from "ai"
import { z } from "zod"

/**
 * Tool schemas shared by the service and its clients. apps/ai adds `execute`; clients use the
 * types to render tool parts. To add a tool: define its schema here, then implement it in
 * apps/ai/src/tools/.
 */
export const chatTools = {
  getCurrentTime: tool({
    description: "Get the current date and time in an IANA time zone, e.g. Europe/Stockholm.",
    inputSchema: z.object({
      timeZone: z.string().describe("IANA time zone name, e.g. America/New_York"),
    }),
    outputSchema: z.object({
      timeZone: z.string(),
      iso: z.string(),
      formatted: z.string(),
    }),
  }),
}

export type ChatTools = InferUITools<typeof chatTools>

/** Message type for `useChat<ChatMessage>()`: tool parts are typed, e.g. `tool-getCurrentTime`. */
export type ChatMessage = UIMessage<unknown, never, ChatTools>
