"use client"

import { useEffect } from "react"
import { markBellCurrent } from "@/lib/bell-current"

/**
 * Rendered by the Notifications page only: keeps the header bell's `aria-current="page"` right
 * across soft navigations into and out of the page (see `markBellCurrent`). Renders nothing.
 */
export function BellCurrent(): null {
  useEffect(() => markBellCurrent(), [])
  return null
}
