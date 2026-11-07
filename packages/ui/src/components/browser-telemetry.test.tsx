import { expect, mock, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"

let installs = 0
mock.module("@repo/telemetry/browser", () => ({
  installBrowserHandlers: () => installs++,
  reportError: () => {},
  reportVital: () => {},
}))
const { BrowserTelemetry } = await import("./browser-telemetry")

test("renders nothing and installs only on the client (effects do not run in SSR)", () => {
  expect(renderToStaticMarkup(<BrowserTelemetry />)).toBe("")
  expect(installs).toBe(0)
})
