"use client"

import { type ComponentProps, useEffect, useState } from "react"
import type { ExploreNav as ExploreNavComponent } from "./explore-nav"
import { ExploreNavBar } from "./explore-nav-bar"

type Props = ComponentProps<typeof ExploreNavComponent>

/**
 * `ExploreNav` (motion's layout engine and the carousel, ~65 KB) is not part of any page's first
 * JavaScript: the server renders the closed bar, and the animated navigation loads right after
 * the page and takes its place — identical while closed, so the swap is invisible.
 */
export function ExploreNavLoader(props: Props) {
  const [Nav, setNav] = useState<typeof ExploreNavComponent | null>(null)

  useEffect(() => {
    let alive = true
    void import("./explore-nav").then((mod) => {
      if (alive) setNav(() => mod.ExploreNav)
    })
    return () => {
      alive = false
    }
  }, [])

  if (Nav) return <Nav {...props} />
  return (
    <ExploreNavBar
      brand={props.brand}
      book={props.book}
      sections={props.sections}
      labels={props.labels}
    />
  )
}
