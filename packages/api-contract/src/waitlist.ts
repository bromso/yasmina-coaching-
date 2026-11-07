import { z } from "zod"
import { EmailSchema } from "./auth"

/** The app a waitlist sign-up came from. */
export const WaitlistSourceSchema = z.enum(["www", "app", "docs", "help", "jobs"])

export const WaitlistJoinSchema = z.object({
  email: EmailSchema,
  source: WaitlistSourceSchema.default("www"),
})

/** The same answer for a new and a repeat email, so the endpoint never says who is on the list. */
export const WaitlistJoinResultSchema = z.object({ joined: z.literal(true) })
