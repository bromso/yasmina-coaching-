/**
 * Zod-free invitation domain allowlist rules: safe for a browser bundle that must not pull in zod
 * or the oRPC contract (both rooted in this package's index, which re-exports this module through
 * `./workspace`). `apps/api` normalises and matches with these, and `apps/account` validates the
 * owner's list with the very same rule, so the two can never disagree.
 *
 * A workspace's list holds A-label domains (`xn--bcher-kva.de`, never `bücher.de`), matched
 * exactly: `acme.com` admits `a@acme.com`, never `a@eu.acme.com`. An empty list admits any address.
 */

/** The most domains a workspace may list (after normalising and removing duplicates). */
export const MAX_INVITE_DOMAINS = 20

/** `data.reason` on `workspaces.security.setInviteDomains`' BAD_REQUEST for a line that is not a domain. */
export const INVITE_DOMAIN_INVALID_REASON = "invite_domain_invalid"
/** `data.reason` on the same BAD_REQUEST when more than `MAX_INVITE_DOMAINS` remain. */
export const INVITE_DOMAIN_LIMIT_REASON = "invite_domain_limit"
/**
 * `data.reason` on the FORBIDDEN an invitation outside a workspace's list answers with: on
 * `workspaces.invitations.create` (with `INVITE_DOMAIN_RESTRICTED_MESSAGE`) and on
 * `invitations.accept` / `acceptById` (with `INVITE_DOMAIN_NO_LONGER_ALLOWED_MESSAGE`). The reason
 * code only, never the invitee's address.
 */
export const INVITE_DOMAIN_REASON = "invite_domain"
/** The English text of create's refusal, `{domains}` the workspace's list, formatted as a list. */
export const INVITE_DOMAIN_RESTRICTED_MESSAGE =
  "Invitations to this workspace are limited to: {domains}."
/** The English text of an accept's refusal: the list changed after the invitation was sent. */
export const INVITE_DOMAIN_NO_LONGER_ALLOWED_MESSAGE =
  "This workspace no longer accepts invitations to this address."
export const INVITE_DOMAINS_INVALID_MESSAGE = "Check the lines listed below."
export const INVITE_DOMAINS_LIMIT_MESSAGE = "You can list up to 20 domains."

/** Anything longer than this is refused before it is parsed at all (a domain is at most 253). */
const MAX_INPUT_LENGTH = 1000
/**
 * Characters the URL host parser would treat as the end of the host, a port, userinfo or a
 * percent-escape (`acme.com/x` and `acme%2ecom` both parse to `acme.com`), plus whitespace and
 * control characters (it silently drops a tab or a newline): any of them refuses the line rather
 * than letting the parser cut or rewrite it.
 */
const UNSAFE = /[\s\p{Cc}/\\?#@:%]/u
/** One label of an A-label domain: `[a-z0-9-]`, 1–63, no leading or trailing hyphen. */
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

/**
 * The ASCII (A-label) form of a host, through the WHATWG URL host parser: lower-cases, applies the
 * UTS #46 mapping (`Ⓐcme.com` and `acme。com` → `acme.com`) and Punycode, exactly as `node:url`'s
 * `domainToASCII` does under Bun — but available in every browser too, where Next's `url` shim has
 * no `domainToASCII`. Null when the parser refuses the host.
 */
export function toASCII(domain: string): string | null {
  try {
    return new URL(`http://${domain}`).hostname
  } catch {
    return null
  }
}

/**
 * One allowlist entry in its stored form, or null when it is not a usable email domain: trimmed,
 * one leading `@` dropped, converted to its A-label form, one trailing dot dropped, then refused
 * when empty, longer than 253, a single label (`localhost` included), an IP literal, or holding a
 * label that is empty, longer than 63, starts or ends with `-` or has anything but `[a-z0-9-]`
 * (so `a_b.com` and `<script>.com` are refused), or whose last label is shorter than 2 characters
 * or all digits.
 */
export function normalizeInviteDomain(input: string): string | null {
  let value = input.trim()
  if (value.startsWith("@")) value = value.slice(1)
  if (value === "" || value.length > MAX_INPUT_LENGTH || UNSAFE.test(value)) return null
  let ascii = toASCII(value)
  if (ascii === null) return null
  if (ascii.endsWith(".")) ascii = ascii.slice(0, -1)
  if (ascii === "" || ascii.length > 253 || ascii === "localhost") return null
  const labels = ascii.split(".")
  if (labels.length < 2 || !labels.every((label) => LABEL.test(label))) return null
  const last = labels.at(-1) ?? ""
  // An all-digit last label is an IPv4 address in one of its forms (`1.2.3.4`, `1.2.3`).
  if (last.length < 2 || /^\d+$/.test(last)) return null
  return ascii
}

export type NormalizedInviteDomains = {
  /** The valid entries, normalised, duplicates removed, in their first-seen order. */
  domains: string[]
  /** 0-based indexes of the lines that are not a domain (blank lines are skipped, never invalid). */
  invalid: number[]
  /** More than `MAX_INVITE_DOMAINS` distinct domains remain. */
  overLimit: boolean
}

/** A whole list, one entry per line: normalised, deduplicated, its invalid lines named by index. */
export function normalizeInviteDomains(lines: readonly string[]): NormalizedInviteDomains {
  const domains: string[] = []
  const invalid: number[] = []
  lines.forEach((line, index) => {
    if (line.trim() === "") return
    const domain = normalizeInviteDomain(line)
    if (domain === null) invalid.push(index)
    else if (!domains.includes(domain)) domains.push(domain)
  })
  return { domains, invalid, overLimit: domains.length > MAX_INVITE_DOMAINS }
}

/** Everything after an address's last `@` (`""` when it has none). */
export function emailDomain(address: string): string {
  const at = address.lastIndexOf("@")
  return at < 0 ? "" : address.slice(at + 1)
}

/**
 * Whether `address` may be invited under `domains` (a workspace's stored list): any address when
 * the list is empty, otherwise only one whose domain, normalised, equals an entry exactly.
 */
export function inviteDomainAllowed(domains: readonly string[], address: string): boolean {
  if (domains.length === 0) return true
  const domain = normalizeInviteDomain(emailDomain(address))
  return domain !== null && domains.includes(domain)
}
