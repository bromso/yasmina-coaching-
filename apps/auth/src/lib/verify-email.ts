import { ORPCError } from "@orpc/client"
import { createLogger } from "@repo/log"

const logger = createLogger({ service: "auth" })

/** `newToken()` in apps/api: 32 bytes base64url, always 43 characters. Anything else never hits the api. */
export const isPlausibleToken = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token)

export type VerifyEmailDeps = { verifyEmail(input: { token: string }): Promise<void> }

/** Both failure kinds render the same page; an undeclared error is logged because it is ours to fix. */
export async function verifyEmailCore(
  deps: VerifyEmailDeps,
  token: string
): Promise<"verified" | "invalid"> {
  if (!isPlausibleToken(token)) return "invalid"
  try {
    await deps.verifyEmail({ token })
    return "verified"
  } catch (error) {
    if (!(error instanceof ORPCError && error.defined && error.code === "BAD_REQUEST")) {
      logger.error("verifyEmail failed", { error })
    }
    return "invalid"
  }
}

export type VerifyEmailState = "verified" | "invalid" | "already-verified"

/**
 * The page's state from the core's result and the signed-in user. A mail scanner that prefetches
 * the link consumes the token before the user clicks; when that user's address is in fact verified,
 * say so instead of "expired or already used".
 */
export function verifyEmailState(
  result: "verified" | "invalid",
  user: { emailVerified: boolean } | null
): VerifyEmailState {
  return result === "invalid" && user?.emailVerified ? "already-verified" : result
}
