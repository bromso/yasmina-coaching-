import { ORPCError } from "@orpc/client"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { loadEnv, MissingEnvError } from "./env"
import { appTranslator } from "./i18n"

/**
 * A message safe to show on the page. Contract errors (`defined`, e.g. "Note not found") and
 * 400/404 answers pass through as-is. Everything else — guard, rate-limit and server errors, an
 * unreachable API, a missing variable — names the URL (and the status) or the variable in
 * development, and is a generic message in production, in the reader's `locale`: callers log the
 * real error, and internal addresses and messages never reach end users. The development-only
 * diagnostics stay English: they are for whoever runs the stack, never production-facing.
 */
export function describeApiError(
  error: unknown,
  {
    nodeEnv = process.env.NODE_ENV,
    locale = DEFAULT_LOCALE,
  }: { nodeEnv?: string; locale?: Locale } = {}
): string {
  if (error instanceof ORPCError && (error.defined || error.status === 400 || error.status === 404))
    return error.message
  if (nodeEnv === "production") return appTranslator(locale)("errors.notesUnavailable")
  if (error instanceof MissingEnvError) return error.message
  const url = loadEnv(["API_URL"], { ...process.env, NODE_ENV: nodeEnv }).API_URL
  if (error instanceof ORPCError) return `The API at ${url} answered ${error.status} ${error.code}`
  return `Couldn't reach the API at ${url}`
}
