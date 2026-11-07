import type { ProviderId } from "@repo/api-contract"

/** How each sign-in provider is named in the UI. */
export const PROVIDER_LABELS: Record<ProviderId, string> = {
  google: "Google",
  github: "GitHub",
  apple: "Apple",
}

/** The label for a provider id from a URL, or undefined for anything that is not one. */
export function providerLabel(id: string | undefined): string | undefined {
  return id && Object.hasOwn(PROVIDER_LABELS, id) ? PROVIDER_LABELS[id as ProviderId] : undefined
}
