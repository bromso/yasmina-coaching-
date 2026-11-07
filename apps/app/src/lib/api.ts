import "server-only"
import { getAuth } from "./auth"

/**
 * The typed apps/api client acting as the signed-in user (the session cookie, not just the
 * service token). There is deliberately no service-only client here: user data is only ever read
 * as the user. Call `getAuth().requireUser()` first.
 */
export const api = async () => await getAuth().api()

export { describeApiError } from "./api-errors"
