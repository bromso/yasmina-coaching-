"use client"

import { installBrowserHandlers } from "@repo/telemetry/browser"
import { useEffect } from "react"

/** window.onerror + unhandledrejection → this app's /api/telemetry. Renders nothing. */
export function BrowserTelemetry() {
  useEffect(() => {
    installBrowserHandlers()
  }, [])
  return null
}
