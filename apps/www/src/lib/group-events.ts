import type { GroupEvent } from "@repo/api-contract"

/*
 * Client-safe (no Zod): the group page's list is a client component, which must not pull the
 * contract root into the browser bundle — only this file and the `GroupEvent` type.
 */

export type EventSeries = { key: string; title: string; events: GroupEvent[] }

/**
 * Upcoming group events grouped for the page: the dates of one weekly series together (so a
 * visitor can tick several), every other event on its own. Order follows the first date of each.
 */
export function groupBySeries(events: readonly GroupEvent[]): EventSeries[] {
  const sorted = [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const groups = new Map<string, EventSeries>()
  for (const event of sorted) {
    const key = event.seriesKey ? `series:${event.seriesKey}` : `event:${event.id}`
    const group = groups.get(key)
    if (group) group.events.push(event)
    else groups.set(key, { key, title: event.title, events: [event] })
  }
  return [...groups.values()]
}
