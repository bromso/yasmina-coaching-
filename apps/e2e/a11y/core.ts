// Pure accessibility-check logic shared by the Playwright fixture (fixtures/a11y.ts) and its unit
// tests (scripts/a11y.test.ts). No Playwright or axe import: `bun test scripts` runs in CI before
// `bun install`, so this file must stand alone.

/** Every axe rule tagged with one of these fails the build, whatever its impact. */
export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] as const

/** The part of an axe result this code reads (axe-core's `Result`, narrowed). */
export type Violation = {
  id: string
  impact?: string | null
  help: string
  helpUrl: string
  nodes: Array<{ target: unknown[] }>
}

/**
 * One reviewed exception in `apps/e2e/a11y.allowlist.json`. `route` is `<app>:<path>`, where `*`
 * matches one or more characters; `selector`, when set, must appear in the failing node's target.
 * `state: true` marks an entry for a journey state, which the page sweep never visits, so the
 * stale-entry test (tests/a11y-pages.spec.ts) skips it.
 */
export type AllowEntry = {
  rule: string
  route: string
  selector?: string
  reason: string
  state?: boolean
}

const escapeRegex = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")

/**
 * Whether `route` (`<app>:<path>`) matches `pattern`, `*` standing for one or more characters (so
 * `help:/*` matches `help:/x` but not `help:/` itself).
 */
export function routeMatches(pattern: string, route: string): boolean {
  const re = new RegExp(`^${pattern.split("*").map(escapeRegex).join(".+")}$`)
  return re.test(route)
}

const targetText = (node: { target: unknown[] }) => node.target.map(String).join(" ")

/**
 * Drops every node an allowlist entry covers (same rule, route matched, selector contained in the
 * node's target when given) and every violation left with no node. `matched` lists the indexes of
 * the entries that covered at least one node, for the stale-entry test.
 */
export function applyAllowlist(
  violations: Violation[],
  entries: AllowEntry[],
  route: string
): { remaining: Violation[]; matched: number[] } {
  const matched = new Set<number>()
  const remaining: Violation[] = []
  for (const violation of violations) {
    const nodes = violation.nodes.filter((node) => {
      const index = entries.findIndex(
        (entry) =>
          entry.rule === violation.id &&
          routeMatches(entry.route, route) &&
          (entry.selector === undefined || targetText(node).includes(entry.selector))
      )
      if (index === -1) return true
      matched.add(index)
      return false
    })
    if (nodes.length > 0)
      remaining.push(nodes.length === violation.nodes.length ? violation : { ...violation, nodes })
  }
  return { remaining, matched: [...matched].sort((a, b) => a - b) }
}

/** A readable failure: one block per violation, its first five failing selectors. */
export function formatViolations(label: string, violations: Violation[]): string {
  const blocks = violations.map((v) => {
    const targets = v.nodes.slice(0, 5).map((n) => `    ${targetText(n)}`)
    const more = v.nodes.length > 5 ? [`    … and ${v.nodes.length - 5} more`] : []
    return [
      `  ${v.id} (${v.impact ?? "unknown"}): ${v.help}`,
      ...targets,
      ...more,
      `    ${v.helpUrl}`,
    ].join("\n")
  })
  return [`Accessibility violations on ${label}:`, ...blocks].join("\n")
}
