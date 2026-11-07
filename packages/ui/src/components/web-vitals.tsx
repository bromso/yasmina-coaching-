"use client"

import { reportVital } from "@repo/telemetry/browser"
import type { Consent } from "@repo/ui/lib/consent"
import { useReportWebVitals } from "next/web-vitals"
import type { Metric } from "web-vitals"

/**
 * Core Web Vitals (CLS, INP, LCP) plus FCP/TTFB. Development logs; everywhere else the metric goes
 * to this app's /api/telemetry (see @repo/telemetry), which forwards it to apps/api. The browser
 * client reads the consent cookie itself: a vital never carries anything identifying, so consent
 * only decides whether the user agent rides along on error events.
 */
export function reportWebVitals(metric: Metric, env: string | undefined = process.env.NODE_ENV) {
  if (env === "development") {
    console.log(`[Web Vital] ${metric.name}:`, {
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      id: metric.id,
    })
    return
  }
  reportVital(metric)
}

/**
 * Drop into any app's root layout: <WebVitals consent={…} /> (the prop is kept for callers; the
 * cookie is the source of truth). The module-level `reportWebVitals` is passed directly — not
 * wrapped in a new closure — because `useReportWebVitals` keys its observers on callback identity,
 * and a fresh closure on every render would re-register them and double-report vitals.
 */
// biome-ignore lint/correctness/noUnusedFunctionParameters: kept for the layouts' call sites
export function WebVitals({ consent }: { consent?: Consent | null }) {
  useReportWebVitals(reportWebVitals)
  return null
}
