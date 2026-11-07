/** Where a heading sits relative to the band the table of contents treats as "being read". */
export type HeadingPosition = "above" | "inside" | "below"

/** The reading band, in viewport pixels from the top: a heading whose top is within it is
 * `inside`, above `top` it is `above`, below `bottom` it is `below`. */
export type ReadingBand = { top: number; bottom: number }

/**
 * Every heading's position from its current top edge (`getBoundingClientRect().top`), measured
 * fresh each time: unlike observer entries, which only report crossings, this stays right after a
 * jump (a hash link, Home/End, a scrollbar drag) that moves a heading past the band in one step.
 */
export function headingPositions(
  tops: readonly { id: string; top: number }[],
  band: ReadingBand
): Map<string, HeadingPosition> {
  return new Map(
    tops.map(({ id, top }) => [
      id,
      top < band.top ? "above" : top <= band.bottom ? "inside" : "below",
    ])
  )
}

/**
 * The heading the table of contents marks as current, from each heading's position (`ids` in
 * document order): the first heading inside the reading band; with none inside, the last one
 * already scrolled past (its section is the one on screen); with none passed yet, none — the
 * reader is above the first heading. A heading with no known position counts as below.
 */
export function activeHeadingId(
  ids: readonly string[],
  positions: ReadonlyMap<string, HeadingPosition>
): string | undefined {
  const inside = ids.find((id) => positions.get(id) === "inside")
  if (inside) return inside
  for (let index = ids.length - 1; index >= 0; index--) {
    if (positions.get(ids[index] as string) === "above") return ids[index]
  }
  return undefined
}

/** A table-of-contents link's target id: `#install` → `install`, percent-decoded; anything that
 * is not a same-page fragment → `undefined`. */
export function fragmentId(href: string): string | undefined {
  if (!href.startsWith("#") || href.length < 2) return undefined
  try {
    return decodeURIComponent(href.slice(1))
  } catch {
    return href.slice(1)
  }
}
