import type { chatTools } from "@repo/ai-contract"
import { getCurrentTimeTool } from "./get-current-time"

/**
 * Every tool the chat model may call. Add the schema to `chatTools` in @repo/ai-contract first;
 * `satisfies` then fails the typecheck until the tool is implemented here.
 */
export const tools = {
  getCurrentTime: getCurrentTimeTool,
} satisfies Record<keyof typeof chatTools, unknown>
