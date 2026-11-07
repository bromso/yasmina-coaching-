import { describe, expect, test } from "bun:test"
import { domainToASCII } from "node:url"
import { EmailSchema } from "./auth"
import * as root from "./index"
import {
  emailDomain,
  inviteDomainAllowed,
  MAX_INVITE_DOMAINS,
  normalizeInviteDomain,
  normalizeInviteDomains,
  toASCII,
} from "./invite-domains"
import { InviteDomainsBadRequestDataSchema, SetInviteDomainsSchema } from "./workspace"

// The spec's normalisation table (§6), plus the dodges Review Focus 1 names.
const VALID: Array<[string, string]> = [
  ["acme.com", "acme.com"],
  ["ACME.com", "acme.com"],
  ["@acme.com", "acme.com"],
  ["  acme.com\t", "acme.com"],
  ["Bücher.de", "xn--bcher-kva.de"],
  ["XN--BCHER-KVA.DE", "xn--bcher-kva.de"],
  ["例え.テスト", "xn--r8jz45g.xn--zckzah"],
  ["sub.acme.co.uk", "sub.acme.co.uk"],
  ["acme.com.", "acme.com"],
  ["Ⓐcme.com", "acme.com"],
  ["acme。com", "acme.com"],
  ["ａｃｍｅ.com", "acme.com"],
  ["a-b.io", "a-b.io"],
  ["1password.com", "1password.com"],
  // 253 characters, the longest a domain may be.
  [
    `${"a".repeat(62)}.${"b".repeat(62)}.${"c".repeat(62)}.${"d".repeat(61)}.co`,
    `${"a".repeat(62)}.${"b".repeat(62)}.${"c".repeat(62)}.${"d".repeat(61)}.co`,
  ],
  [`${"a".repeat(63)}.com`, `${"a".repeat(63)}.com`],
]
const INVALID = [
  "",
  "   ",
  "@",
  "@@acme.com",
  "a_b.com",
  "localhost",
  "localhost.",
  "acme",
  "-acme.com",
  "acme-.com",
  "a..b",
  "acme.com..",
  ".acme.com",
  "1.2.3.4",
  "1.2.3",
  "0x7f.0x1",
  "[::1]",
  "::1",
  "exa mple.com",
  "ac\tme.com",
  "<script>.com",
  "<script>alert(1)</script>.owasp.org",
  `${"a".repeat(64)}.com`,
  "acme.c",
  "acme.123",
  "a@acme.com",
  "acme.com/evil.org",
  "acme.com:443",
  "acme.com?x",
  "acme.com#x",
  "acme%2ecom",
  "a\\b.com",
  "a*b.com",
  "xn--iñvalid.com",
  // 254 characters: every label fine, the whole too long.
  `${"a".repeat(62)}.${"b".repeat(62)}.${"c".repeat(62)}.${"d".repeat(62)}.co`,
]

describe("normalizeInviteDomain", () => {
  test.each(VALID)("%p → %p", (input, expected) => {
    expect(normalizeInviteDomain(input)).toBe(expected)
  })

  test.each(INVALID.map((input) => [input]))("%p is refused", (input) => {
    expect(normalizeInviteDomain(input)).toBeNull()
  })

  test("an over-long input is refused before it is parsed", () => {
    expect(normalizeInviteDomain(`${"a".repeat(2000)}.com`)).toBeNull()
  })

  test("is idempotent: a stored entry normalises to itself", () => {
    for (const [, stored] of VALID) expect(normalizeInviteDomain(stored)).toBe(stored)
  })
})

describe("toASCII (the URL host parser) agrees with node:url's domainToASCII", () => {
  // The browser path: `normalizeInviteDomain` converts through `new URL(…).hostname`, which every
  // browser implements (WHATWG URL host parsing, UTS #46), because Next's client `url` shim has
  // no `domainToASCII`. Every input that reaches the conversion (one the UNSAFE characters
  // didn't refuse first) must give exactly what `domainToASCII` gives on the server — "" and
  // null both being a refusal.
  const reachesConversion = (value: string) => !/[\s\p{Cc}/\\?#@:%]/u.test(value)
  const inputs = [...VALID.map(([input]) => input.trim().replace(/^@/, "")), ...INVALID]
    .filter((value) => value !== "" && reachesConversion(value))
    .concat(["acme.com.", "A.B.C.D.COM", "straße.de", "ﬁ.com", "acme­.com", "acme​.com"])

  test.each(inputs.map((input) => [input]))("%p", (input) => {
    const server = domainToASCII(input)
    expect(toASCII(input) ?? "").toBe(server)
  })
})

describe("normalizeInviteDomains", () => {
  test("dedupes after normalising, keeps first-seen order and skips blank lines", () => {
    expect(
      normalizeInviteDomains(["Acme.com", "", "acme.se", "@ACME.COM", "  ", "acme.com.", "b.io"])
    ).toEqual({ domains: ["acme.com", "acme.se", "b.io"], invalid: [], overLimit: false })
  })

  test("names every invalid line by its 0-based index, never its text", () => {
    const result = normalizeInviteDomains(["acme.com", "a_b.com", "", "localhost", "b.io"])
    expect(result).toEqual({ domains: ["acme.com", "b.io"], invalid: [1, 3], overLimit: false })
  })

  test(`over the limit only past ${MAX_INVITE_DOMAINS} distinct domains`, () => {
    const lines = Array.from({ length: MAX_INVITE_DOMAINS }, (_, i) => `d${i}.com`)
    expect(normalizeInviteDomains(lines).overLimit).toBe(false)
    // Duplicates do not count towards it.
    expect(normalizeInviteDomains([...lines, "D0.com", "d1.com."]).overLimit).toBe(false)
    expect(normalizeInviteDomains([...lines, "one-more.com"]).overLimit).toBe(true)
  })

  test("an empty list is valid and allows any address", () => {
    expect(normalizeInviteDomains([])).toEqual({ domains: [], invalid: [], overLimit: false })
  })
})

describe("emailDomain and inviteDomainAllowed", () => {
  test("emailDomain is what follows the last @", () => {
    expect(emailDomain("a@acme.com")).toBe("acme.com")
    expect(emailDomain("no-at")).toBe("")
  })

  /** An address as the invitation procedures see it: through `EmailSchema`. */
  const address = (raw: string) => EmailSchema.parse(raw)

  test("an empty list allows every address", () => {
    expect(inviteDomainAllowed([], address("a@anything.org"))).toBe(true)
  })

  test("an exact match only: a subdomain or a parent is its own entry", () => {
    const list = [normalizeInviteDomain("acme.com") as string]
    expect(inviteDomainAllowed(list, address("A@ACME.com"))).toBe(true)
    expect(inviteDomainAllowed(list, address("a@eu.acme.com"))).toBe(false)
    expect(inviteDomainAllowed(list, address("a@acme.com.evil.org"))).toBe(false)
    expect(inviteDomainAllowed(list, address("a@notacme.com"))).toBe(false)
    expect(
      inviteDomainAllowed([normalizeInviteDomain("eu.acme.com") as string], address("a@acme.com"))
    ).toBe(false)
  })

  test("entries typed in any form match the address's A-label form", () => {
    for (const entry of ["ACME.com.", "@acme.com", "Ⓐcme.com", "acme。com"]) {
      expect(
        inviteDomainAllowed([normalizeInviteDomain(entry) as string], address("a@acme.com"))
      ).toBe(true)
    }
    const idn = [normalizeInviteDomain("Bücher.de") as string]
    expect(inviteDomainAllowed(idn, address("a@xn--bcher-kva.de"))).toBe(true)
    expect(inviteDomainAllowed(idn, address("a@bucher.de"))).toBe(false)
  })

  test("EmailSchema already refuses the address forms that could dodge the match", () => {
    for (const raw of ["a@bücher.de", "a@acme.com.", "a@a_b.com", "a@acme。com"]) {
      expect(EmailSchema.safeParse(raw).success).toBe(false)
    }
  })
})

describe("the subpath and the contract", () => {
  test("imports nothing, so a client component can use it", async () => {
    const source = await Bun.file(new URL("./invite-domains.ts", import.meta.url)).text()
    expect(source).not.toMatch(/^import /m)
  })

  test("is re-exported from the root", () => {
    expect(root.normalizeInviteDomain).toBe(normalizeInviteDomain)
    expect(root.MAX_INVITE_DOMAINS).toBe(20)
    expect(root.contract.workspaces.security.setInviteDomains).toBeDefined()
  })

  test("the input bounds leave room for invalid lines to come back by index", () => {
    const parse = (domains: unknown) =>
      SetInviteDomainsSchema.safeParse({ workspaceId: 1, domains }).success
    expect(parse([])).toBe(true)
    expect(parse(["x".repeat(1000)])).toBe(true)
    expect(parse(Array.from({ length: MAX_INVITE_DOMAINS * 5 }, () => "a.com"))).toBe(true)
    expect(parse(["x".repeat(1001)])).toBe(false)
    expect(parse(Array.from({ length: MAX_INVITE_DOMAINS * 5 + 1 }, () => "a.com"))).toBe(false)
  })

  test("the BAD_REQUEST data carries a reason and indexes only", () => {
    const parse = (data: unknown) => InviteDomainsBadRequestDataSchema.safeParse(data).success
    expect(parse({ reason: "invite_domain_invalid", indexes: [0, 3] })).toBe(true)
    expect(parse({ reason: "invite_domain_limit" })).toBe(true)
    expect(parse({ reason: "something_else" })).toBe(false)
    expect(parse({ reason: "invite_domain_invalid", indexes: [-1] })).toBe(false)
  })
})
