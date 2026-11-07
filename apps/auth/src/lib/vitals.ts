export type VitalKey = "LCP" | "INP" | "CLS"

export function formatVital(name: VitalKey, value: number | null): string {
  if (value === null) return "—"
  if (name === "LCP") return `${(value / 1000).toFixed(1)} s`
  if (name === "INP") return `${Math.round(value)} ms`
  return value.toFixed(2)
}

export const ratingLabel = (rating: "good" | "needs-improvement" | "poor") =>
  rating === "good" ? "Good" : rating === "needs-improvement" ? "Needs improvement" : "Poor"

export const ratingClass = (rating: "good" | "needs-improvement" | "poor") =>
  rating === "good"
    ? "text-emerald-700 dark:text-emerald-400"
    : rating === "needs-improvement"
      ? "text-amber-700 dark:text-amber-400"
      : "text-red-700 dark:text-red-400"
