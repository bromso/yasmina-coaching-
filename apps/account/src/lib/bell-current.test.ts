import { describe, expect, test } from "bun:test"
import { NotificationBell } from "@repo/ui/blocks/notification-bell"
import { renderToStaticMarkup } from "react-dom/server"
import { isNotificationsUrl, markBellCurrent, NOTIFICATIONS_PATH } from "./bell-current"

describe("isNotificationsUrl", () => {
  test("the Notifications page, with or without its query string, and nothing else", () => {
    const base = "http://account.brand.localhost:3003"
    expect(isNotificationsUrl(`${base}${NOTIFICATIONS_PATH}`)).toBe(true)
    expect(isNotificationsUrl(`${base}/notifications?unread=1&cursor=x`)).toBe(true)
    for (const url of [
      `${base}/`,
      `${base}/security`,
      `${base}/notifications/extra`,
      `${base}/personal-info?next=/notifications`,
      "not a url",
      "",
      null,
      undefined,
    ])
      expect(isNotificationsUrl(url)).toBe(false)
  })
})

/** A one-element stand-in for `document`: only what `markBellCurrent` touches. */
function fakeDocument(link: { attrs: Map<string, string> } | null) {
  const element = link && {
    setAttribute: (name: string, value: string) => link.attrs.set(name, value),
    removeAttribute: (name: string) => link.attrs.delete(name),
  }
  let selector = ""
  return {
    doc: {
      querySelector: (s: string) => {
        selector = s
        return element as unknown as Element | null
      },
    },
    selector: () => selector,
  }
}

describe("markBellCurrent", () => {
  test("marks the bell's link aria-current=page and the undo removes it", () => {
    const link = { attrs: new Map<string, string>() }
    const { doc, selector } = fakeDocument(link)
    const undo = markBellCurrent(doc)
    expect(selector()).toBe('[data-slot="notification-bell"] a')
    expect(link.attrs.get("aria-current")).toBe("page")
    undo()
    expect(link.attrs.has("aria-current")).toBe(false)
  })

  test("no bell on the page is a no-op", () => {
    const { doc } = fakeDocument(null)
    expect(() => markBellCurrent(doc)()).not.toThrow()
  })

  test("the selector matches the block's own markup", () => {
    const html = renderToStaticMarkup(
      NotificationBell({ count: 1, href: NOTIFICATIONS_PATH, label: "1 unread notification" })
    )
    expect(html).toMatch(/^<span data-slot="notification-bell"[^>]*><a /)
  })
})
