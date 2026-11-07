import { createHmac } from "node:crypto"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"
import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { createWorkspace, signUpVerified, uniqueEmail } from "../fixtures/accounts"

type Received = {
  method: string
  path: string
  userAgent: string | null
  webhookId: string | null
  webhookTimestamp: string | null
  webhookSignature: string | null
  body: string
}

/**
 * Verifies a Standard Webhooks signature (apps/api/src/webhooks/sign.ts):
 * `webhook-signature: v1,<base64 HMAC-SHA256(key, "<id>.<timestamp>.<body>")>`, where `key` is the
 * base64-decoded secret after `whsec_`. Implemented with `node:crypto` directly rather than the
 * `standardwebhooks` package (already an `apps/api` dependency, not `apps/e2e`'s) — this is a
 * three-line HMAC, not worth a new devDependency. The receiver below is `node:http`, not
 * `Bun.serve`: `apps/e2e`'s tsconfig declares only `"types": ["node"]` (every other fixture here —
 * `global-setup.ts`, `fixtures/mail.ts` — is `node:fs`/`node:path` only), so a Bun global would not
 * typecheck without widening it; `node:http` behaves the same whichever runtime actually executes
 * the test file.
 */
function verifySignature(secret: string, received: Received): boolean {
  const key = Buffer.from(secret.slice("whsec_".length), "base64")
  const expected = `v1,${createHmac("sha256", key)
    .update(`${received.webhookId}.${received.webhookTimestamp}.${received.body}`, "utf8")
    .digest("base64")}`
  return received.webhookSignature === expected
}

test("receive a signed webhook, then nothing once the endpoint is disabled", async ({ page }) => {
  const received: Received[] = []
  // 127.0.0.1, port 0: an ephemeral port the OS assigns. The SSRF guard pins any `*.localhost`
  // host to 127.0.0.1 under WEBHOOK_ALLOW_LOCALHOST_HTTP (set for the e2e api in e2e.env.ts), so
  // the delivery job dials exactly where this receiver listens.
  const receiver = createServer((req, res) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => {
      received.push({
        method: req.method ?? "",
        path: req.url ?? "",
        userAgent: req.headers["user-agent"] ?? null,
        webhookId: (req.headers["webhook-id"] as string | undefined) ?? null,
        webhookTimestamp: (req.headers["webhook-timestamp"] as string | undefined) ?? null,
        webhookSignature: (req.headers["webhook-signature"] as string | undefined) ?? null,
        body: Buffer.concat(chunks).toString("utf8"),
      })
      res.statusCode = 204
      res.end()
    })
  })
  await new Promise<void>((resolve) => receiver.listen(0, "127.0.0.1", resolve))
  const receiverPort = (receiver.address() as AddressInfo).port

  try {
    const hookUrl = `http://webhook-recv.localhost:${receiverPort}/hook`

    await signUpVerified(page, uniqueEmail("webhooks"))
    await createWorkspace(page, "Webhooks Co")

    // Webhooks need a plan with the `api` feature (Pro or Team) — same mock-provider upgrade path
    // as api-keys.spec.ts / billing.spec.ts.
    await page.goto(`${URLS.account}/payments`)
    await page.getByRole("radio", { name: /Pro/ }).check()
    await page.getByRole("button", { name: "Continue to checkout" }).click()
    await expect(page).toHaveURL(/checkout=success/)
    await expect(page.getByText("You're on Pro.")).toBeVisible()

    await page.goto(`${URLS.account}/workspace`)
    await page.getByLabel("Endpoint URL", { exact: true }).fill(hookUrl)
    await page.getByLabel("Note created", { exact: true }).check()
    await page.getByRole("button", { name: "Add endpoint" }).click()

    await expect(page.getByText("Your new webhook endpoint")).toBeVisible()
    const secretInput = page.getByLabel("Signing secret", { exact: true })
    const secret = await secretInput.inputValue()
    // whsec_ + base64 of 32 bytes — apps/api/src/webhooks/sign.ts's WEBHOOK_SECRET_PATTERN.
    expect(secret).toMatch(/^whsec_[A-Za-z0-9+/]{43}=$/) // gitleaks:allow

    // Done (hydrated) cancels the navigation and returns focus to the card's title.
    await page.getByRole("link", { name: "Done with webhook secret" }).click()
    await expect(secretInput).toHaveCount(0)
    await expect(page.locator("#webhooks-heading")).toBeFocused()

    const row = page.locator("li").filter({ hasText: hookUrl })
    await expect(row.getByText("Active", { exact: true })).toBeVisible()

    const title = `Webhook note ${Date.now()}`
    await page.goto(`${URLS.app}/notes`)
    await page.getByLabel("Title").fill(title)
    await page.getByLabel("Body").fill("Delivered over a webhook")
    await page.getByRole("button", { name: "Add note" }).click()
    await expect(page.getByRole("listitem").filter({ hasText: title })).toBeVisible()

    // note.created is a queued job; the api's in-process worker polls every second (JOBS_POLL_MS).
    // Bound the wait generously above that.
    await expect.poll(() => received.length, { timeout: 20_000 }).toBeGreaterThan(0)
    const delivery = received[0]
    if (!delivery) throw new Error("unreachable: received.length > 0")
    expect(delivery.method).toBe("POST")
    expect(delivery.path).toBe("/hook")
    // msg_ + base64url of 16 bytes — apps/api/src/webhooks/sign.ts's WEBHOOK_EVENT_ID_PATTERN.
    expect(delivery.webhookId).toMatch(/^msg_[A-Za-z0-9_-]{22}$/)
    expect(delivery.webhookTimestamp).toMatch(/^\d+$/)
    // Signed now, not replayed: within the 5-minute tolerance a receiver enforces.
    expect(
      Math.abs(Math.floor(Date.now() / 1000) - Number(delivery.webhookTimestamp))
    ).toBeLessThanOrEqual(300)
    expect(delivery.webhookSignature).toMatch(/^v1,/)
    expect(delivery.userAgent).toMatch(/-webhooks$/)
    expect(verifySignature(secret, delivery)).toBe(true)

    const event = JSON.parse(delivery.body)
    expect(event.type).toBe("note.created")
    expect(event.data.title).toBe(title)

    // Disable the endpoint: open its Edit disclosure, uncheck Enabled, save.
    await page.goto(`${URLS.account}/workspace`)
    await row.getByText("Edit", { exact: true }).click()
    await row.getByLabel("Enabled", { exact: true }).uncheck()
    await row.getByRole("button", { name: "Save changes" }).click()
    await expect(page.getByText("Webhook endpoint updated.")).toBeVisible()
    await expect(row.getByText("Disabled", { exact: true })).toBeVisible()

    // A second, enabled endpoint on the same receiver: it gets the next note, which is the
    // positive signal that note's deliveries were made — the disabled one's would have been
    // queued in the same transaction, had there been any.
    const otherUrl = `http://webhook-recv.localhost:${receiverPort}/other`
    const addForm = page
      .locator("form")
      .filter({ has: page.getByRole("button", { name: "Add endpoint" }) })
    await addForm.getByLabel("Endpoint URL", { exact: true }).fill(otherUrl)
    await addForm.getByLabel("Note created", { exact: true }).check()
    await addForm.getByRole("button", { name: "Add endpoint" }).click()
    await expect(page.getByText("Your new webhook endpoint")).toBeVisible()
    const otherSecret = await page.getByLabel("Signing secret", { exact: true }).inputValue()
    await page.getByRole("link", { name: "Done with webhook secret" }).click()
    await expect(page.locator("li").filter({ hasText: otherUrl })).toBeVisible()

    const secondTitle = `Webhook note disabled ${Date.now()}`
    await page.goto(`${URLS.app}/notes`)
    await page.getByLabel("Title").fill(secondTitle)
    await page.getByLabel("Body").fill("Only the enabled endpoint gets this")
    await page.getByRole("button", { name: "Add note" }).click()
    await expect(page.getByRole("listitem").filter({ hasText: secondTitle })).toBeVisible()

    await expect
      .poll(() => received.filter((r) => r.path === "/other").length, { timeout: 20_000 })
      .toBe(1)
    const other = received.find((r) => r.path === "/other")
    if (!other) throw new Error("unreachable: one delivery to /other")
    expect(verifySignature(otherSecret, other)).toBe(true)
    expect(JSON.parse(other.body).data.title).toBe(secondTitle)
    // The disabled endpoint got no job at all (emitWebhookEvent loads only enabled, subscribed
    // endpoints): still its one delivery from before.
    expect(received.filter((r) => r.path === "/hook")).toHaveLength(1)
  } finally {
    // The api's fetch may hold a keep-alive socket open, which close() alone would wait on.
    receiver.closeAllConnections()
    await new Promise<void>((resolve) => receiver.close(() => resolve()))
  }
})
