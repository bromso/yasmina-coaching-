import { domainToUnicode } from "node:url"
import { inviteDomainAllowed } from "@repo/api-contract/invite-domains"
import type { createFormatter } from "next-intl"

// A workspace's allowed invitation domains as the Workspace page shows them (Phase 12 C). Server
// code only — `page.tsx`, the views and the action core: `node:url`'s `domainToUnicode` exists
// on the server alone (Next's browser shim for `url` has none), so the cards receive the domains
// already converted, and every list already formatted.

/** A list of domains as one phrase in the reader's language ("a.com, b.com and c.com"). */
export type FormatList = (items: readonly string[]) => string

/**
 * next-intl's list formatting (`format.list(…, { type: "conjunction" })`) as a `FormatList`: from
 * `getFormatter()` in a server action or page, `useFormatter()` in a server component, or
 * `createFormatter({ locale })` in a test. Never a hand-joined string: Swedish ends a list with
 * "och", not a comma.
 */
export function conjunction(format: ReturnType<typeof createFormatter>): FormatList {
  return (items) => format.list(items, { type: "conjunction" })
}

/** A stored (A-label) domain in its Unicode form for reading: `xn--bcher-kva.de` → `bücher.de`.
 * One the converter cannot read is shown as stored. */
export function displayDomain(domain: string): string {
  return domainToUnicode(domain) || domain
}

export function displayDomains(domains: readonly string[]): string[] {
  return domains.map(displayDomain)
}

/**
 * The pending invitations whose address the workspace's current list no longer admits (sent
 * before the list tightened): their ids, for the list's "Outside allowed domains" badge. Empty
 * when the list is — an empty list admits any address.
 */
export function outsideInvitationIds(
  domains: readonly string[],
  invitations: readonly { id: number; email: string }[]
): number[] {
  return invitations.filter((i) => !inviteDomainAllowed(domains, i.email)).map((i) => i.id)
}
