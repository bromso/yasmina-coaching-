import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { NotificationBell, notificationBadge } from "./notification-bell"

const href = "http://account.brand.localhost:3003/notifications"

describe("notificationBadge", () => {
  test("nothing for an unknown or zero count, the number up to 99, then 99+", () => {
    expect(notificationBadge(null)).toBeNull()
    expect(notificationBadge(0)).toBeNull()
    expect(notificationBadge(1)).toBe("1")
    expect(notificationBadge(99)).toBe("99")
    expect(notificationBadge(100)).toBe("99+")
    expect(notificationBadge(5000)).toBe("99+")
  })
})

describe("NotificationBell", () => {
  test("a link named by the label, with a hidden icon and a hidden badge", () => {
    const html = renderToStaticMarkup(
      <NotificationBell count={3} href={href} label="3 unread notifications" />
    )
    expect(html).toMatch(
      /<a href="http:\/\/account\.brand\.localhost:3003\/notifications" aria-label="3 unread notifications"/
    )
    expect(html).toMatch(/<svg aria-hidden="true"/)
    expect(html).toMatch(
      /<span data-slot="notification-bell-badge" aria-hidden="true"[^>]*>3<\/span>/
    )
  })

  test("caps the badge at 99+", () => {
    const html = renderToStaticMarkup(
      <NotificationBell count={100} href={href} label="More than 99 unread notifications" />
    )
    expect(html).toMatch(/notification-bell-badge[^>]*>99\+<\/span>/)
  })

  test("no badge for zero or an unknown count, the link still there", () => {
    for (const count of [0, null]) {
      const html = renderToStaticMarkup(
        <NotificationBell count={count} href={href} label="Notifications" />
      )
      expect(html).not.toContain("notification-bell-badge")
      expect(html).toContain('aria-label="Notifications"')
    }
  })

  test("a polite live region holds the label, or liveLabel when given", () => {
    const plain = renderToStaticMarkup(
      <NotificationBell count={1} href={href} label="1 unread notification" />
    )
    expect(plain).toMatch(/<span[^>]*role="status"[^>]*>1 unread notification<\/span>/)
    const live = renderToStaticMarkup(
      <NotificationBell count={1} href={href} label="1 unread notification" liveLabel="New: 1" />
    )
    expect(live).toMatch(/<span[^>]*role="status"[^>]*>New: 1<\/span>/)
  })

  test('current marks the link aria-current="page"; nothing by default', () => {
    const here = renderToStaticMarkup(
      <NotificationBell count={1} href={href} label="1 unread notification" current />
    )
    expect(here).toMatch(/<a [^>]*aria-current="page"/)
    for (const html of [
      renderToStaticMarkup(
        <NotificationBell count={1} href={href} label="1 unread notification" />
      ),
      renderToStaticMarkup(
        <NotificationBell count={1} href={href} label="1 unread notification" current={false} />
      ),
    ])
      expect(html).not.toContain("aria-current")
  })

  test("merges className onto the link and passes other anchor props through", () => {
    const html = renderToStaticMarkup(
      <NotificationBell
        count={2}
        href={href}
        label="2 unread notifications"
        className="extra"
        id="bell"
      />
    )
    expect(html).toMatch(/<a [^>]*class="[^"]*extra[^"]*"[^>]*id="bell"/)
  })
})
