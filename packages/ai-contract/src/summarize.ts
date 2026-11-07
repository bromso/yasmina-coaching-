import { z } from "zod"

export const SummarizeInputSchema = z.object({
  text: z.string().min(1).max(20_000),
})

// The descriptions are sent to the model as part of the output schema.
export const SummarySchema = z.object({
  title: z.string().describe("A short title, at most 10 words"),
  summary: z.string().describe("Two or three sentences"),
  keyPoints: z.array(z.string()).max(5).describe("Up to five key points"),
})

export type Summary = z.infer<typeof SummarySchema>
