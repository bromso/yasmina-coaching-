import { createServer } from "node:net"
import { type Browser, chromium } from "@playwright/test"
import lighthouse from "lighthouse"
import { screenEmulationMetrics } from "lighthouse/core/config/constants.js"
import type { LhrLike } from "../perf/core"

/** A TCP port nothing listens on right now, for Chromium's remote debugging. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      server.close(() =>
        typeof address === "object" && address
          ? resolve(address.port)
          : reject(new Error("no port"))
      )
    })
  })
}

/**
 * Playwright's own Chromium (no second browser download) with a remote-debugging port Lighthouse
 * connects to. Lighthouse opens its own tab per run and resets storage before each.
 */
export async function launchForLighthouse(): Promise<{ browser: Browser; port: number }> {
  const port = await freePort()
  const browser = await chromium.launch({ args: [`--remote-debugging-port=${port}`] })
  return { browser, port }
}

/** One Lighthouse performance run of `url`: mobile emulation, simulated throttling. */
export async function runLighthouse(url: string, port: number): Promise<LhrLike> {
  const result = await lighthouse(url, {
    port,
    output: "json",
    logLevel: "error",
    onlyCategories: ["performance"],
    formFactor: "mobile",
    screenEmulation: screenEmulationMetrics.mobile,
    throttlingMethod: "simulate",
  })
  if (!result) throw new Error(`Lighthouse returned no result for ${url}`)
  return result.lhr as LhrLike
}
