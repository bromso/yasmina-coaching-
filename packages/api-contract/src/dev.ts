/**
 * apps/api's public development token. Outside production the service falls back to it when
 * API_SERVICE_TOKEN is unset, and callers default to it so `bun dev` needs no setup. In production
 * the service refuses to start with it, even when it is set explicitly.
 */
export const DEV_API_TOKEN = "dev-only-insecure-api-token"
