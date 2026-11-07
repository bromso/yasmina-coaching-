import { chatTools } from "@repo/ai-contract"
import { tool } from "ai"

export function getCurrentTime(timeZone: string, now = new Date()) {
  let formatted: string
  try {
    formatted = new Intl.DateTimeFormat("en-US", {
      timeZone,
      dateStyle: "full",
      timeStyle: "long",
    }).format(now)
  } catch {
    // The AI SDK returns this message to the model as a tool error, so it can retry correctly.
    throw new Error(`Unknown time zone "${timeZone}". Use an IANA name such as Europe/Stockholm.`)
  }
  return { timeZone, iso: now.toISOString(), formatted }
}

export const getCurrentTimeTool = tool({
  ...chatTools.getCurrentTime,
  execute: async ({ timeZone }) => getCurrentTime(timeZone),
})
