import { describe, expect, test } from "bun:test"
import { generateRecoveryCodes, looksLikeRecoveryCode, normalizeRecoveryCode } from "./recovery"
import { decryptSecret, encryptSecret } from "./secret"
import {
  encodeSecret,
  generateTotpSecret,
  otpauthUrl,
  TOTP_PERIOD_SECONDS,
  verifyTotp,
} from "./totp"

// RFC 6238 Appendix B: the shared secret is the ASCII string "12345678901234567890" (SHA-1).
const RFC_SECRET = new TextEncoder().encode("12345678901234567890")

describe("verifyTotp", () => {
  test.each([
    [59, "287082"],
    [1111111109, "081804"],
    [1111111111, "050471"],
    [1234567890, "005924"],
    [2000000000, "279037"],
    [20000000000, "353130"],
  ])("RFC 6238 vector at %i matches the last 6 digits %s", (now, code) => {
    expect(verifyTotp(RFC_SECRET, code, null, now)).toBe(Math.floor(now / TOTP_PERIOD_SECONDS))
  })

  test("window of +-1 step accepts the neighbouring steps", () => {
    const now = 1111111111
    const step = Math.floor(now / TOTP_PERIOD_SECONDS)
    expect(verifyTotp(RFC_SECRET, "050471", null, now - TOTP_PERIOD_SECONDS)).toBe(step)
    expect(verifyTotp(RFC_SECRET, "050471", null, now + TOTP_PERIOD_SECONDS)).toBe(step)
  })

  test("refuses a code two steps away", () => {
    const now = 1111111111
    expect(verifyTotp(RFC_SECRET, "050471", null, now - 2 * TOTP_PERIOD_SECONDS)).toBeNull()
    expect(verifyTotp(RFC_SECRET, "050471", null, now + 2 * TOTP_PERIOD_SECONDS)).toBeNull()
  })

  test("refuses a replayed step (lastStep = matched step)", () => {
    const now = 1111111111
    const step = Math.floor(now / TOTP_PERIOD_SECONDS)
    expect(verifyTotp(RFC_SECRET, "050471", step, now)).toBeNull()
    expect(verifyTotp(RFC_SECRET, "050471", step - 1, now)).toBe(step)
  })

  test("refuses malformed codes", () => {
    expect(verifyTotp(RFC_SECRET, "12345", null, 59)).toBeNull()
    expect(verifyTotp(RFC_SECRET, "abcdef", null, 59)).toBeNull()
  })

  test("never throws for a non-finite now", () => {
    expect(verifyTotp(RFC_SECRET, "287082", null, Number.NaN)).toBeNull()
    expect(verifyTotp(RFC_SECRET, "287082", null, Number.POSITIVE_INFINITY)).toBeNull()
    expect(verifyTotp(RFC_SECRET, "287082", null, Number.NEGATIVE_INFINITY)).toBeNull()
  })

  test("never throws and skips negative steps near the epoch", () => {
    expect(() => verifyTotp(RFC_SECRET, "000000", null, 0)).not.toThrow()
    expect(() => verifyTotp(RFC_SECRET, "000000", null, 10)).not.toThrow()
  })
})

describe("generateTotpSecret / encodeSecret / otpauthUrl", () => {
  test("generates 20 random bytes", () => {
    const secret = generateTotpSecret()
    expect(secret).toBeInstanceOf(Uint8Array)
    expect(secret.length).toBe(20)
    expect(generateTotpSecret()).not.toEqual(secret)
  })

  test("encodes as upper-case base32 with no padding", () => {
    const secret = generateTotpSecret()
    const encoded = encodeSecret(secret)
    expect(encoded).toMatch(/^[A-Z2-7]+$/)
    expect(encoded).not.toContain("=")
  })

  test("builds an otpauth:// URL carrying the account, issuer and encoded secret", () => {
    const secret = generateTotpSecret()
    const url = otpauthUrl(secret, "user@example.com", "Boilerplate")
    expect(url.startsWith("otpauth://totp/")).toBe(true)
    expect(url).toContain(encodeURIComponent("user@example.com"))
    expect(url).toContain("issuer=Boilerplate")
    expect(url).toContain(`secret=${encodeSecret(secret)}`)
  })
})

describe("encryptSecret / decryptSecret", () => {
  const KEY = "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA=" // 32 bytes, base64; gitleaks:allow
  const OTHER_KEY = "MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE=" // gitleaks:allow

  test("round-trips a secret", async () => {
    const secret = generateTotpSecret()
    const stored = await encryptSecret(secret, KEY)
    expect(await decryptSecret(stored, KEY)).toEqual(secret)
  })

  test("two encryptions of the same secret differ (random IV)", async () => {
    const secret = generateTotpSecret()
    const a = await encryptSecret(secret, KEY)
    const b = await encryptSecret(secret, KEY)
    expect(a).not.toBe(b)
  })

  test("the stored string starts v1: and never contains the base32 secret", async () => {
    const secret = generateTotpSecret()
    const stored = await encryptSecret(secret, KEY)
    expect(stored.startsWith("v1:")).toBe(true)
    expect(stored).not.toContain(encodeSecret(secret))
  })

  test("decrypting with the wrong key throws", async () => {
    const secret = generateTotpSecret()
    const stored = await encryptSecret(secret, KEY)
    await expect(decryptSecret(stored, OTHER_KEY)).rejects.toThrow()
  })

  test("rejects a key that is not strict standard base64 of 32 bytes", async () => {
    const secret = generateTotpSecret()
    const keyWithJunk = `${KEY.slice(0, -1)}!`
    await expect(encryptSecret(secret, keyWithJunk)).rejects.toThrow(
      "Encryption key must decode to 32 bytes"
    )
  })

  test("rejects a malformed stored value: wrong number of parts", async () => {
    await expect(decryptSecret("v1:onlyonepart", KEY)).rejects.toThrow("Malformed encrypted secret")
    await expect(decryptSecret("v1:a:b:c", KEY)).rejects.toThrow("Malformed encrypted secret")
  })

  test("rejects a malformed stored value: wrong IV length", async () => {
    const shortIv = Buffer.alloc(4).toString("base64")
    await expect(
      decryptSecret(`v1:${shortIv}:${Buffer.alloc(16).toString("base64")}`, KEY)
    ).rejects.toThrow("Malformed encrypted secret")
  })
})

describe("recovery codes", () => {
  test("generates 10 unique codes matching the format", () => {
    const codes = generateRecoveryCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const code of codes) expect(code).toMatch(/^[a-z2-7]{5}-[a-z2-7]{5}$/)
  })

  test("normalizes whitespace, case and the separator", () => {
    const [code] = generateRecoveryCodes(1)
    if (!code) throw new Error("expected a generated code")
    const cleaned = code.replace("-", " ")
    expect(normalizeRecoveryCode(` ${cleaned.toUpperCase()} `)).toBe(code)
  })

  test("normalize rejects malformed input", () => {
    expect(normalizeRecoveryCode("not-a-code")).toBeNull()
    expect(normalizeRecoveryCode("abcde-fghi")).toBeNull()
    expect(normalizeRecoveryCode("abcde-fghi1")).toBeNull()
  })

  test("looksLikeRecoveryCode mirrors normalize", () => {
    const [code] = generateRecoveryCodes(1)
    if (!code) throw new Error("expected a generated code")
    expect(looksLikeRecoveryCode(code)).toBe(true)
    expect(looksLikeRecoveryCode("123456")).toBe(false)
  })
})
