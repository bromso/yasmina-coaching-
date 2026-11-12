export type VitalKey = "LCP" | "INP" | "CLS"

export function formatVital(name: VitalKey, value: number | null): string {
  if (value === null) return "—"
  if (name === "LCP") return `${(value / 1000).toFixed(1)} s`
  if (name === "INP") return `${Math.round(value)} ms`
  return value.toFixed(2)
}

export const ratingLabel = (rating: "good" | "needs-improvement" | "poor") =>
  rating === "good" ? "Good" : rating === "needs-improvement" ? "Needs improvement" : "Poor"

/** The palette has no green or amber: a good value stays plain, a poor one takes the destructive
 * colour, and the rating label beside every value carries the meaning either way. */
export const ratingClass = (rating: "good" | "needs-improvement" | "poor") =>
  rating === "good"
    ? ""
    : rating === "needs-improvement"
      ? "font-medium"
      : "text-destructive font-medium"
