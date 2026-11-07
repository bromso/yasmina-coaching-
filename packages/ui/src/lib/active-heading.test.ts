import { describe, expect, test } from "bun:test"
import {
  activeHeadingId,
  fragmentId,
  type HeadingPosition,
  headingPositions,
} from "./active-heading"

const ids = ["intro", "install", "usage"]
const at = (entries: [string, HeadingPosition][]) => new Map(entries)

describe("activeHeadingId", () => {
  test("the first heading inside the reading band wins", () => {
    expect(
      activeHeadingId(
        ids,
        at([
          ["intro", "above"],
          ["install", "inside"],
          ["usage", "inside"],
        ])
      )
    ).toBe("install")
  })

  test("with none inside, the last heading scrolled past is current", () => {
    expect(
      activeHeadingId(
        ids,
        at([
          ["intro", "above"],
          ["install", "above"],
          ["usage", "below"],
        ])
      )
    ).toBe("install")
  })

  test("document order decides, not the map's order", () => {
    expect(
      activeHeadingId(
        ids,
        at([
          ["usage", "inside"],
          ["install", "inside"],
        ])
      )
    ).toBe("install")
  })

  test("above the first heading, or with nothing known, none is current", () => {
    expect(activeHeadingId(ids, at([["intro", "below"]]))).toBeUndefined()
    expect(activeHeadingId(ids, new Map())).toBeUndefined()
    expect(activeHeadingId([], new Map())).toBeUndefined()
  })
})

describe("fragmentId", () => {
  test("a same-page fragment gives its id, decoded", () => {
    expect(fragmentId("#install")).toBe("install")
    expect(fragmentId("#caf%C3%A9")).toBe("café")
  })

  test("anything else gives none", () => {
    expect(fragmentId("/install")).toBeUndefined()
    expect(fragmentId("#")).toBeUndefined()
    expect(fragmentId("https://x.test/#a")).toBeUndefined()
  })

  test("a malformed escape is kept as written", () => {
    expect(fragmentId("#100%")).toBe("100%")
  })
})

describe("headingPositions", () => {
  const band = { top: 64, bottom: 270 }

  test("each heading is above, inside or below the band by its top edge", () => {
    expect([
      ...headingPositions(
        [
          { id: "a", top: -500 },
          { id: "b", top: 63 },
          { id: "c", top: 64 },
          { id: "d", top: 270 },
          { id: "e", top: 271 },
        ],
        band
      ),
    ]).toEqual([
      ["a", "above"],
      ["b", "above"],
      ["c", "inside"],
      ["d", "inside"],
      ["e", "below"],
    ])
  })

  test("after a jump past every heading, the last one passed is current", () => {
    const tops = [
      { id: "intro", top: -2000 },
      { id: "install", top: -1200 },
      { id: "usage", top: -40 },
    ]
    expect(activeHeadingId(["intro", "install", "usage"], headingPositions(tops, band))).toBe(
      "usage"
    )
  })
})
