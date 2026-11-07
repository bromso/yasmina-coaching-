/**
 * The AI service's public development token. Outside production apps/ai falls back to it when
 * AI_SERVICE_TOKEN is unset, and callers default to it so `bun dev` needs no setup. In production
 * the service refuses to start with it, even when it is set explicitly.
 */
export const DEV_TOKEN = "dev-only-insecure-token"
