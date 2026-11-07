import type { ProviderId } from "@repo/api-contract"

/**
 * Each sign-in provider's own name. A module of its own so the Connected-accounts card (a client
 * component) reads it without pulling the action cores and their catalogs into the browser.
 */
export const PROVIDER_LABELS: Record<ProviderId, string> = {
  google: "Google",
  github: "GitHub",
  apple: "Apple",
}
