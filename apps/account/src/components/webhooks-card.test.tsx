import { describe, expect, mock, test } from "bun:test"
import type { WebhookDelivery, WebhookEndpoint } from "@repo/api-contract"
import { renderIn } from "@/test-intl"

// The card imports its server actions, which reach @repo/session (`server-only`).
mock.module("server-only", () => ({}))
const { WebhooksCard } = await import("./webhooks-card")

const endpoint = (overrides: Partial<WebhookEndpoint> = {}): WebhookEndpoint => ({
  id: 7,
  url: "https://example.com/hooks/bb",
  description: "Our CI",
  events: ["note.created", "note.deleted"],
  enabled: true,
  disabledReason: null,
  disabledAt: null,
  consecutiveFailures: 0,
  createdBy: { id: 1, name: "Ada" },
  createdAt: "2026-03-01T00:00:00.000Z",
  lastDelivery: null,
  ...overrides,
})

const delivery = (overrides: Partial<WebhookDelivery> = {}): WebhookDelivery => ({
  id: 1,
  eventId: "msg_abcdefghijklmnop",
  eventType: "note.created",
  attempt: 1,
  status: 200,
  error: null,
  durationMs: 123,
  createdAt: "2026-03-02T05:06:00.000Z",
  ...overrides,
})

describe("WebhooksCard, server render (before hydration)", () => {
  test("lists the endpoint's url, description, events, status and last delivery", () => {
    const html = renderIn(
      "en",
      <WebhooksCard
        endpoints={[endpoint({ lastDelivery: delivery() })]}
        deliveriesByEndpoint={{ 7: [delivery()] }}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain("https://example.com/hooks/bb")
    expect(html).toContain("Our CI")
    expect(html).toContain("Note created, Note deleted")
    expect(html).toContain(">Active<")
    expect(html).toContain("Last delivery:")
    expect(html).toContain("Attempt 1")
    expect(html).toContain("123 ms")
  })

  test("a disabled endpoint names its reason", () => {
    for (const [reason, text] of [
      ["failures", "too many failed deliveries"],
      ["gone", "410 Gone"],
      ["manual", "Disabled"],
    ] as const) {
      const html = renderIn(
        "en",
        <WebhooksCard
          endpoints={[endpoint({ enabled: false, disabledReason: reason })]}
          deliveriesByEndpoint={{}}
          workspaceId={5}
          isImpersonating={false}
          locale="en"
          docsUrl="https://docs.brand.localhost:3004"
        />
      )
      expect(html).toContain(text)
    }
  })

  test("no deliveries yet reads as a sentence, not a date", () => {
    const html = renderIn(
      "en",
      <WebhooksCard
        endpoints={[endpoint({ lastDelivery: null })]}
        deliveriesByEndpoint={{}}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain("No deliveries yet.")
  })

  test("the empty state", () => {
    const html = renderIn(
      "en",
      <WebhooksCard
        endpoints={[]}
        deliveriesByEndpoint={{}}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain("No webhook endpoints yet.")
  })

  test("while impersonating: read-only, no add form, the list stays visible", () => {
    const html = renderIn(
      "en",
      <WebhooksCard
        endpoints={[endpoint()]}
        deliveriesByEndpoint={{}}
        workspaceId={5}
        isImpersonating
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain("https://example.com/hooks/bb")
    expect(html).toContain("Not available while impersonating.")
    expect(html).not.toContain(">Add endpoint</button>")
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Delete<\/button>/)
  })

  test("the arming status region is mounted, empty, before any row is armed", () => {
    const html = renderIn(
      "en",
      <WebhooksCard
        endpoints={[endpoint()]}
        deliveriesByEndpoint={{}}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain('<p role="status" class="sr-only"></p>')
  })

  // Regression for the bug the API keys card once shipped with: every row form must carry the
  // current workspace as a hidden field, or `sameWorkspace`'s server-side check always refuses
  // the submission as "switch to that workspace first", without ever reaching the api.
  test("every row form (edit, rotate, test, delete) carries the workspace and endpoint as hidden fields", () => {
    const html = renderIn(
      "en",
      <WebhooksCard
        endpoints={[endpoint()]}
        deliveriesByEndpoint={{}}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    // Every form naming this endpoint's id (edit, rotate, test, delete — the add form has none).
    const forms = (html.match(/<form[^>]*>[\s\S]*?<\/form>/g) ?? []).filter((form) =>
      form.includes('name="id" value="7"')
    )
    expect(forms.length).toBe(4)
    for (const form of forms) {
      expect(form).toContain('<input type="hidden" name="workspaceId" value="5"/>')
      expect(form).toContain('<input type="hidden" name="id" value="7"/>')
    }
  })

  test("a second workspace's endpoint still carries its own workspace id on every row form", () => {
    const html = renderIn(
      "en",
      <WebhooksCard
        endpoints={[endpoint()]}
        deliveriesByEndpoint={{}}
        workspaceId={42}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    const forms = (html.match(/<form[^>]*>[\s\S]*?<\/form>/g) ?? []).filter((form) =>
      form.includes('name="id" value="7"')
    )
    expect(forms.length).toBe(4)
    for (const form of forms) {
      expect(form).toContain('<input type="hidden" name="workspaceId" value="42"/>')
    }
  })

  test("each row's Edit, Rotate secret, Send test event and Recent deliveries name its URL, like Delete", () => {
    const html = renderIn(
      "en",
      <WebhooksCard
        endpoints={[endpoint()]}
        deliveriesByEndpoint={{}}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    const id = html.match(
      /<span id="([^"]+)" class="sr-only">https:\/\/example\.com\/hooks\/bb<\/span>/
    )?.[1]
    expect(id).toBeDefined()
    const described = html.match(new RegExp(`<[^>]*aria-describedby="${id}"[^>]*>[^<]*`, "g")) ?? []
    const names = described.map((tag) => tag.slice(tag.lastIndexOf(">") + 1))
    expect(names).toEqual([
      "Edit",
      "Rotate secret",
      "Send test event",
      "Recent deliveries",
      "Delete",
    ])
  })

  test("recent deliveries lists event, attempt, status or error class, duration and time", () => {
    const html = renderIn(
      "en",
      <WebhooksCard
        endpoints={[endpoint()]}
        deliveriesByEndpoint={{
          7: [delivery({ status: null, error: "timeout", attempt: 2 })],
        }}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain("Recent deliveries")
    expect(html).toContain("Attempt 2")
    expect(html).toContain("Timed out")
    // Never a response body.
    expect(html).not.toContain("body")
  })

  test("no deliveries recorded reads as a sentence", () => {
    const html = renderIn(
      "en",
      <WebhooksCard
        endpoints={[endpoint()]}
        deliveriesByEndpoint={{ 7: [] }}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain("No deliveries have been recorded yet.")
  })
})

describe("the edit form", () => {
  test("starts with the endpoint's own url, description and ticked events", () => {
    const html = renderIn(
      "en",
      <WebhooksCard
        endpoints={[endpoint()]}
        deliveriesByEndpoint={{}}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain('value="https://example.com/hooks/bb"')
    expect(html).toContain('value="Our CI"')
    expect(html).toContain("Endpoint URL")
    expect(html).toContain("Endpoint description")
    // The endpoint's own two subscribed events are checked.
    const checkboxes = html.match(/<input type="checkbox" id="[^"]*note-created[^"]*"[^>]*>/)?.[0]
    expect(checkboxes).toContain("checked")
  })

  test("the Enabled checkbox reflects the endpoint's own state", () => {
    const on = renderIn(
      "en",
      <WebhooksCard
        endpoints={[endpoint({ enabled: true })]}
        deliveriesByEndpoint={{}}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(on).toMatch(/<input type="checkbox"[^>]*name="enabled"[^>]*checked=""[^>]*\/>/)

    const off = renderIn(
      "en",
      <WebhooksCard
        endpoints={[endpoint({ enabled: false, disabledReason: "manual" })]}
        deliveriesByEndpoint={{}}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(off).not.toMatch(/name="enabled" checked=""/)
  })
})

describe("the add form", () => {
  test("no event starts ticked", () => {
    const html = renderIn(
      "en",
      <WebhooksCard
        endpoints={[]}
        deliveriesByEndpoint={{}}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    // The add form's own checkboxes are the only ones on the page (no endpoints yet).
    expect(
      html
        .match(/<input type="checkbox"[^>]*name="events"[^>]*>/g)
        ?.every((tag) => !tag.includes("checked"))
    ).toBe(true)
    expect(html).toContain('value="note.created"')
    expect(html).toContain('value="api_key.revoked"')
    expect(html).toContain(">Add endpoint</button>")
  })

  test("the checkboxes are native, not the Radix component that needs hydration to submit", () => {
    const html = renderIn(
      "en",
      <WebhooksCard
        endpoints={[]}
        deliveriesByEndpoint={{}}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toMatch(/<input type="checkbox"[^>]*name="events"[^>]*value="note\.created"/)
  })

  test("in Swedish, the card's labels", () => {
    const html = renderIn(
      "sv",
      <WebhooksCard
        endpoints={[]}
        deliveriesByEndpoint={{}}
        workspaceId={5}
        isImpersonating={false}
        locale="sv"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain("Inga webhook-mottagare än.")
    expect(html).toContain(">Lägg till mottagare</button>")
  })
})

describe("without the api feature (Free, or a downgraded workspace)", () => {
  test("the list, Recent deliveries and Delete stay; no add form, no Edit, Rotate secret or Send test event", () => {
    const html = renderIn(
      "en",
      <WebhooksCard
        endpoints={[endpoint()]}
        deliveriesByEndpoint={{ 7: [delivery()] }}
        workspaceId={5}
        isImpersonating={false}
        canManage={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain("https://example.com/hooks/bb")
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Delete<\/button>/)
    expect(html).toContain("Recent deliveries")
    expect(html).not.toContain(">Add endpoint</button>")
    expect(html).not.toContain("Add a webhook endpoint")
    // No Edit disclosure, and neither the Rotate secret nor Send test event forms.
    expect(html).not.toContain(">Edit<")
    expect(html).not.toContain("Save changes")
    expect(html).not.toContain("Rotate secret")
    expect(html).not.toContain("Send test event")
    expect(html).not.toContain('name="enabled"')
    // The upgrade note takes their place, once per row.
    expect(html).toContain("Upgrade to change webhooks.")
  })

  test("in Swedish, the same upgrade note", () => {
    const html = renderIn(
      "sv",
      <WebhooksCard
        endpoints={[endpoint()]}
        deliveriesByEndpoint={{}}
        workspaceId={5}
        isImpersonating={false}
        canManage={false}
        locale="sv"
        docsUrl="https://docs.brand.localhost:3004"
      />
    )
    expect(html).toContain("Uppgradera för att ändra webhooks.")
    expect(html).not.toContain("Byt signeringsnyckel")
  })
})

describe("the developer docs link", () => {
  test("points at docsUrl, with text naming webhooks specifically (not the API keys card's text)", () => {
    const html = renderIn(
      "en",
      <WebhooksCard
        endpoints={[]}
        deliveriesByEndpoint={{}}
        workspaceId={5}
        isImpersonating={false}
        locale="en"
        docsUrl="https://docs.brand.localhost:3004/developers/webhooks"
      />
    )
    expect(html).toMatch(
      /<a href="https:\/\/docs\.brand\.localhost:3004\/developers\/webhooks"[^>]*>Read the webhook docs<\/a>/
    )
  })

  test("in Swedish", () => {
    const html = renderIn(
      "sv",
      <WebhooksCard
        endpoints={[]}
        deliveriesByEndpoint={{}}
        workspaceId={5}
        isImpersonating={false}
        locale="sv"
        docsUrl="https://docs.brand.localhost:3004/developers/webhooks"
      />
    )
    expect(html).toContain(">Läs dokumentationen om webhooks</a>")
  })
})
