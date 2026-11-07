export type NodeEnv = "development" | "production" | "test"

/** Development and test are the only modes with insecure conveniences (dev tokens, localhost). */
export const isDevLike = (nodeEnv: NodeEnv) => nodeEnv === "development" || nodeEnv === "test"

/** Production tokens must be at least this long (`openssl rand -hex 32` gives 64). */
export const MIN_PRODUCTION_TOKEN_LENGTH = 32

/**
 * The bearer token a service requires. Development and test accept any given token and fall back
 * to the public dev token. Production fails closed: it refuses to start without a token, with the
 * public dev token, or with a token shorter than MIN_PRODUCTION_TOKEN_LENGTH characters.
 */
export function resolveServiceToken({
  given,
  devToken,
  nodeEnv,
  name,
}: {
  given: string | undefined
  devToken: string
  nodeEnv: NodeEnv
  name: string
}): string {
  if (isDevLike(nodeEnv)) return given ?? devToken
  if (!given) throw new Error(`${name} is required in production`)
  if (given === devToken) {
    throw new Error(`${name} must not be the public development token in production`)
  }
  if (given.length < MIN_PRODUCTION_TOKEN_LENGTH) {
    throw new Error(
      `${name} must be at least ${MIN_PRODUCTION_TOKEN_LENGTH} characters in production`
    )
  }
  return given
}
