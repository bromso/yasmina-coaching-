import { describe, expect, test } from "bun:test"
import { Webhook } from "standardwebhooks"
import {
  newEventId,
  newWebhookSecret,
  signedHeaders,
  signWebhook,
  WEBHOOK_EVENT_ID_PATTERN,
  WEBHOOK_SECRET_PATTERN,
} from "./sign"

const now = () => Math.floor(Date.now() / 1000)

describe("newWebhookSecret", () => {
  test("whsec_ + base64 of 32 random bytes, different every time", () => {
    const a = newWebhookSecret()
    const b = newWebhookSecret()
    expect(a).toMatch(WEBHOOK_SECRET_PATTERN)
    expect(a).not.toBe(b)
    expect(a.startsWith("whsec_")).toBe(true)
    expect(Buffer.from(a.slice(6), "base64")).toHaveLength(32)
  })
})

describe("newEventId", () => {
  test("msg_ + base64url of 16 random bytes: no dot, different every time", () => {
    const id = newEventId()
    expect(id).toMatch(WEBHOOK_EVENT_ID_PATTERN)
    expect(id).not.toContain(".")
    expect(Buffer.from(id.slice(4), "base64url")).toHaveLength(16)
    expect(newEventId()).not.toBe(id)
  })
})

describe("signWebhook verifies with the official standardwebhooks library", () => {
  const bodies = [
    '{"type":"ping","timestamp":"2026-10-18T12:00:00.000Z","data":{"endpointId":1}}',
    JSON.stringify({
      type: "note.created",
      timestamp: "2026-10-18T12:00:00.000Z",
      data: { id: 1, title: "Smörgåsbord på ön", body: "Åäö ÅÄÖ — ✓ 🎉👩🏽‍💻", author: null },
    }),
    '{"data":{"name":"Örjan Ängström","emoji":"🇸🇪"}}',
  ]
  for (const body of bodies) {
    test(`body ${JSON.stringify(body).slice(0, 40)}…`, () => {
      const secret = newWebhookSecret()
      const id = newEventId()
      const timestamp = now()
      const signature = signWebhook({ secret, id, timestamp, body })
      expect(signature).toMatch(/^v1,[A-Za-z0-9+/]+=*$/)
      const headers = {
        "webhook-id": id,
        "webhook-timestamp": String(timestamp),
        "webhook-signature": signature,
      }
      // With the whsec_ prefix (the library strips it) and without.
      expect(new Webhook(secret).verify(body, headers)).toEqual(JSON.parse(body))
      expect(() => new Webhook(secret.slice(6)).verify(body, headers)).not.toThrow()
      expect(signedHeaders({ secret, id, timestamp, body })).toEqual(headers)
    })
  }

  test("matches the library's own signature byte for byte", () => {
    const secret = newWebhookSecret()
    const id = newEventId()
    const timestamp = now()
    const body = '{"data":{"title":"åäö 🙂"}}'
    expect(signWebhook({ secret, id, timestamp, body })).toBe(
      new Webhook(secret).sign(id, new Date(timestamp * 1000), body)
    )
  })

  test("any change to the body, id, timestamp or secret fails verification", () => {
    const secret = newWebhookSecret()
    const id = newEventId()
    const timestamp = now()
    const body = '{"title":"åäö"}'
    const headers = signedHeaders({ secret, id, timestamp, body })
    const wh = new Webhook(secret)
    expect(() => wh.verify('{"title":"aao"}', headers)).toThrow()
    expect(() => wh.verify(`${body} `, headers)).toThrow()
    expect(() => wh.verify(body, { ...headers, "webhook-id": newEventId() })).toThrow()
    expect(() =>
      wh.verify(body, { ...headers, "webhook-timestamp": String(timestamp - 1) })
    ).toThrow()
    expect(() => new Webhook(newWebhookSecret()).verify(body, headers)).toThrow()
  })

  test("refuses a malformed secret, an id with a dot, or a non-integer timestamp", () => {
    const secret = newWebhookSecret()
    const ok = { secret, id: newEventId(), timestamp: now(), body: "{}" }
    expect(() => signWebhook({ ...ok, secret: "not-a-secret" })).toThrow()
    expect(() => signWebhook({ ...ok, id: "msg_a.b" })).toThrow()
    expect(() => signWebhook({ ...ok, timestamp: 1.5 })).toThrow()
  })
})
