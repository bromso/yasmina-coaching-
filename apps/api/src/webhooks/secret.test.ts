import { describe, expect, test } from "bun:test"
import { DEV_TWO_FACTOR_KEY } from "../env"
import { decryptWebhookSecret, encryptWebhookSecret } from "./secret"
import { newWebhookSecret } from "./sign"

const OTHER_KEY = Buffer.alloc(32, 9).toString("base64")

describe("webhook secret at rest", () => {
  test("round-trips; stored as v1:<iv>:<ct>, never containing the secret", async () => {
    const secret = newWebhookSecret()
    const stored = await encryptWebhookSecret(secret, DEV_TWO_FACTOR_KEY)
    expect(stored).toMatch(/^v1:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/)
    expect(stored).not.toContain(secret.slice(6))
    expect(await decryptWebhookSecret(stored, DEV_TWO_FACTOR_KEY)).toBe(secret)
  })

  test("a fresh IV each time: the same secret never stores the same way twice", async () => {
    const secret = newWebhookSecret()
    expect(await encryptWebhookSecret(secret, DEV_TWO_FACTOR_KEY)).not.toBe(
      await encryptWebhookSecret(secret, DEV_TWO_FACTOR_KEY)
    )
  })

  test("the wrong key or a malformed value throws", async () => {
    const stored = await encryptWebhookSecret(newWebhookSecret(), DEV_TWO_FACTOR_KEY)
    await expect(decryptWebhookSecret(stored, OTHER_KEY)).rejects.toThrow()
    await expect(decryptWebhookSecret("v1:nope", DEV_TWO_FACTOR_KEY)).rejects.toThrow()
  })
})
