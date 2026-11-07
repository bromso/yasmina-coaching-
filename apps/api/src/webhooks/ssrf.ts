// The SSRF guard for outgoing webhooks (OWASP SSRF Prevention Cheat Sheet). A URL passes only
// when it is https (or, with WEBHOOK_ALLOW_LOCALHOST_HTTP, http/https to `*.localhost`), carries no
// userinfo and no fragment, is at most WEBHOOK_URL_MAX characters, and EVERY address its host
// resolves to is public. The answer carries the checked addresses: delivery dials only those (the
// address in the URL, `Host` and `tls.serverName` naming the host), so DNS answering differently
// between the check and the connection (rebinding) can never reach a private address.
//
// `isPublicAddress` is pure; `checkWebhookUrl` takes its resolver as an argument so tests stub DNS.
import { lookup } from "node:dns/promises"
import { isIP } from "node:net"
import { WEBHOOK_URL_MAX } from "@repo/api-contract/webhooks-limits"

/** Resolves a hostname to every A and AAAA address it has (strings, no brackets). */
export type Resolver = (hostname: string) => Promise<string[]>

/** How long the system resolver waits before the guard gives up (`unresolvable`). */
export const DNS_TIMEOUT_MS = 5_000

/**
 * `resolve`, rejecting once `ms` pass without an answer: `getaddrinfo` can block for many seconds,
 * and on the request path nothing else would bound it but the request deadline. The guard reads
 * the rejection as `unresolvable`. The lookup itself cannot be cancelled; its late answer is
 * dropped.
 */
export function resolverWithTimeout(resolve: Resolver, ms: number): Resolver {
  return (hostname) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`DNS lookup timed out after ${ms} ms`)), ms)
    })
    return Promise.race([resolve(hostname), timeout]).finally(() => clearTimeout(timer))
  }
}

/** The system resolver: `getaddrinfo` through `dns/promises`, every record of both families,
 * given up after `DNS_TIMEOUT_MS`. */
export const systemResolver: Resolver = resolverWithTimeout(
  async (hostname) =>
    (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address),
  DNS_TIMEOUT_MS
)

/** Why a URL was refused. `blocked`: a non-public address (or localhost where not allowed). */
export type WebhookUrlRefusal =
  | "invalid"
  | "scheme"
  | "credentials"
  | "fragment"
  | "too_long"
  | "unresolvable"
  | "blocked"

export type WebhookUrlCheck =
  | {
      ok: true
      /** The parsed URL (WHATWG-normalised). Its `host` (with a non-default port) is the `Host`. */
      url: URL
      /** The hostname without IPv6 brackets or a trailing dot: what `Host` and `tls.serverName`
       * name (RFC 6066 forbids the dot in SNI) and what is resolved. `url.href` keeps it as typed. */
      host: string
      /** The explicit port, else 443 for https / 80 for http. */
      port: number
      /** Every address the host resolved to, each checked public (loopback for localhost). */
      addresses: string[]
    }
  | { ok: false; reason: WebhookUrlRefusal }

export type CheckWebhookUrlOptions = {
  resolve: Resolver
  /** WEBHOOK_ALLOW_LOCALHOST_HTTP: allows `http`/`https` to `localhost` and `*.localhost`. */
  allowLocalhostHttp: boolean
}

// ---------------------------------------------------------------------------------------------
// Address classification

type Range = readonly [base: bigint, prefix: number]

const v4 = (text: string): bigint => {
  const parts = text.split(".").map(Number)
  return parts.reduce((acc, part) => (acc << 8n) | BigInt(part), 0n)
}

/** Every IPv4 range that is never a webhook target (the spec's list; broadcast is in 240/4). */
const V4_BLOCKED: readonly Range[] = [
  [v4("0.0.0.0"), 8],
  [v4("10.0.0.0"), 8],
  [v4("100.64.0.0"), 10],
  [v4("127.0.0.0"), 8],
  [v4("169.254.0.0"), 16],
  [v4("172.16.0.0"), 12],
  [v4("192.0.0.0"), 24],
  [v4("192.0.2.0"), 24],
  [v4("192.88.99.0"), 24], // deprecated 6to4 relay anycast (RFC 7526)
  [v4("192.168.0.0"), 16],
  [v4("198.18.0.0"), 15],
  [v4("198.51.100.0"), 24],
  [v4("203.0.113.0"), 24],
  [v4("224.0.0.0"), 4],
  [v4("240.0.0.0"), 4],
  [v4("255.255.255.255"), 32],
]

const inRange = (value: bigint, [base, prefix]: Range, bits: number): boolean => {
  const shift = BigInt(bits - prefix)
  return value >> shift === base >> shift
}

const isPublicV4 = (value: bigint): boolean =>
  !V4_BLOCKED.some((range) => inRange(value, range, 32))

/** An IPv6 address (already validated by `isIP`) as a 128-bit integer. */
function parseV6(text: string): bigint {
  // A dotted IPv4 tail (`::ffff:1.2.3.4`) is the last two groups: rewrite it as hex first.
  const lastColon = text.lastIndexOf(":")
  const last = text.slice(lastColon + 1)
  let head = text
  if (last.includes(".")) {
    const value = v4(last)
    head = `${text.slice(0, lastColon + 1)}${(value >> 16n).toString(16)}:${(value & 0xffffn).toString(16)}`
  }
  const groupsOf = (part: string) =>
    part === "" ? [] : part.split(":").map((group) => BigInt(`0x${group}`))
  let groups: bigint[]
  const gap = head.indexOf("::")
  if (gap === -1) {
    groups = groupsOf(head)
  } else {
    const left = groupsOf(head.slice(0, gap))
    const right = groupsOf(head.slice(gap + 2))
    groups = [...left, ...Array<bigint>(8 - left.length - right.length).fill(0n), ...right]
  }
  return groups.reduce((acc, group) => (acc << 16n) | group, 0n)
}

const v6 = (text: string): bigint => parseV6(text)

/** IPv6 ranges refused outright (inside or outside 2000::/3). */
const V6_BLOCKED: readonly Range[] = [
  [v6("64:ff9b::"), 96], // NAT64 (RFC 6052): reaches whatever IPv4 the gateway can
  [v6("64:ff9b:1::"), 48], // local-use NAT64 (RFC 8215)
  // IANA special-purpose (RFC 2928): Teredo 2001::/32 (an obfuscated IPv4 inside), benchmarking,
  // ORCHID 2001:10::/28 and 2001:20::/28 — none of it a webhook target.
  [v6("2001::"), 23],
  [v6("2001:db8::"), 32], // documentation
  [v6("3fff::"), 20], // documentation (RFC 9637)
  [v6("fc00::"), 7], // unique local
  [v6("fe80::"), 10], // link-local
  [v6("ff00::"), 8], // multicast
]
const GLOBAL_UNICAST: Range = [v6("2000::"), 3]
const LOW_32 = 0xffffffffn

function isPublicV6(value: bigint): boolean {
  const high96 = value >> 32n
  // ::/128 and ::1 are inside ::/96 and fail the IPv4 check below (0.0.0.0/8).
  // IPv4-compatible (::a.b.c.d), IPv4-mapped (::ffff:a.b.c.d), IPv4-translated (::ffff:0:a.b.c.d):
  // judged by the IPv4 address they carry.
  if (high96 === 0n || high96 === 0xffffn || high96 === 0xffff0000n)
    return isPublicV4(value & LOW_32)
  if (V6_BLOCKED.some((range) => inRange(value, range, 128))) return false
  // 6to4 (2002:aabb:ccdd::/48) routes to the IPv4 address in bits 16–48.
  if (value >> 112n === 0x2002n) return isPublicV4((value >> 80n) & LOW_32)
  return inRange(value, GLOBAL_UNICAST, 128)
}

/**
 * Whether `ip` (an IPv4 or IPv6 address, no brackets; an IPv6 zone id is ignored) is a public
 * address a webhook may be delivered to. Anything that is not an address is not public.
 */
export function isPublicAddress(ip: string): boolean {
  const address = ip.includes("%") ? ip.slice(0, ip.indexOf("%")) : ip
  const family = isIP(address)
  if (family === 4) return isPublicV4(v4(address))
  if (family === 6) return isPublicV6(parseV6(address))
  return false
}

// ---------------------------------------------------------------------------------------------
// URL check

const isLocalhostName = (hostname: string): boolean => {
  const name = hostname.toLowerCase().replace(/\.$/, "")
  return name === "localhost" || name.endsWith(".localhost")
}

/**
 * Checks a webhook URL, resolving its host now. Refuses the whole URL when ANY resolved address is
 * non-public; an IP-literal host is checked as written, without resolving.
 */
export async function checkWebhookUrl(
  raw: string,
  { resolve, allowLocalhostHttp }: CheckWebhookUrlOptions
): Promise<WebhookUrlCheck> {
  if (raw.length > WEBHOOK_URL_MAX) return { ok: false, reason: "too_long" }
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: "invalid" }
  }
  // Again on what is stored, the normalised `href`: percent-encoding can make it several times
  // longer than what was typed (each "é" is "%C3%A9"), past the column's 2000-character CHECK.
  if (url.href.length > WEBHOOK_URL_MAX) return { ok: false, reason: "too_long" }
  // One trailing dot (an absolute name) is dropped: `Host` and SNI must not carry it.
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1").replace(/\.$/, "")
  const localhost = isLocalhostName(host)
  const devLocal = allowLocalhostHttp && localhost
  if (url.protocol !== "https:" && !(devLocal && url.protocol === "http:"))
    return { ok: false, reason: "scheme" }
  if (host === "") return { ok: false, reason: "invalid" }
  // `https://@host/` parses with an empty username: look at the written authority too.
  const authority = raw.slice(raw.indexOf("//") + 2).split(/[/?#]/, 1)[0] ?? ""
  if (url.username !== "" || url.password !== "" || authority.includes("@"))
    return { ok: false, reason: "credentials" }
  if (url.hash !== "" || raw.includes("#")) return { ok: false, reason: "fragment" }
  const port = url.port === "" ? (url.protocol === "https:" ? 443 : 80) : Number(url.port)
  if (port === 0) return { ok: false, reason: "invalid" }

  if (localhost) {
    if (!devLocal) return { ok: false, reason: "blocked" }
    return { ok: true, url, host, port, addresses: ["127.0.0.1"] }
  }
  if (isIP(host) !== 0) {
    if (!isPublicAddress(host)) return { ok: false, reason: "blocked" }
    return { ok: true, url, host, port, addresses: [host] }
  }

  let addresses: string[]
  try {
    addresses = await resolve(host)
  } catch {
    return { ok: false, reason: "unresolvable" }
  }
  if (addresses.length === 0) return { ok: false, reason: "unresolvable" }
  if (!addresses.every(isPublicAddress)) return { ok: false, reason: "blocked" }
  return { ok: true, url, host, port, addresses }
}
