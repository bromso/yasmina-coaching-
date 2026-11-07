import { expect, mock, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

const pageviews: unknown[] = []
mock.module("@repo/telemetry/analytics", () => ({
  sendPageview: (...args: unknown[]) => pageviews.push(args),
  track: () => {},
}))
mock.module("next/navigation", () => ({
  usePathname: () => "/pricing",
}))
const { Analytics } = await import("./analytics")

test("renders nothing and sends no pageview during SSR (effects don't run)", () => {
  expect(renderToStaticMarkup(<Analytics />)).toBe("")
  expect(pageviews).toHaveLength(0)
})
