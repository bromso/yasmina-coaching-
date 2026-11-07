"use client"

import { useInView, useReducedMotion } from "motion/react"
import {
  type CSSProperties,
  createContext,
  createElement,
  type ReactNode,
  type RefObject,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { cn } from "@/lib/utils"

/**
 * What a revealed element is doing. `static` is the server's HTML and the only state without
 * JavaScript, under reduced motion, or for anything already on screen when the page hydrates:
 * plainly visible, no transition. `hidden` is the state an off-screen element is put in right
 * after hydration (before paint, so nothing blinks); `shown` is the one-shot rise once it
 * scrolls into view. The movement itself is CSS (`.reveal` in globals.css, `motion-safe` only),
 * so the bundle carries two hooks from motion and no animation runtime.
 */
export type RevealPhase = "static" | "hidden" | "shown"

const VIEW_MARGIN = "0px 0px -10% 0px"

/** One element's phase, from the hooks above, for the component rendering it. */
export function useReveal(ref: RefObject<Element | null>): RevealPhase {
  const reduced = useReducedMotion()
  const [armed, setArmed] = useState(false)
  // Before the first paint after hydration: anything below the fold is hidden until it arrives;
  // anything already on screen (the top of the page, the target of a `#hash`) stays as it is.
  useLayoutEffect(() => {
    if (reduced) return
    const el = ref.current
    if (!el) return
    if (el.getBoundingClientRect().top < window.innerHeight) return
    setArmed(true)
  }, [reduced, ref])
  const inView = useInView(ref, { once: true, margin: VIEW_MARGIN })
  if (!armed) return "static"
  return inView ? "shown" : "hidden"
}

type Tag = "div" | "section" | "ul" | "ol" | "li" | "dl" | "figure" | "p"

const Group = createContext<{ phase: RevealPhase; stagger: number } | null>(null)

type RevealProps = {
  as?: Tag
  className?: string
  /** Milliseconds before this element's own rise. */
  delay?: number
  /**
   * Milliseconds between the rises of the `RevealItem`s inside. With it the group itself never
   * hides, only its items, each after the previous one.
   */
  stagger?: number
  children: ReactNode
  id?: string
}

/** Fades in and rises 16 px, once, when scrolled into view. See `useReveal` for the rules. */
export function Reveal({ as = "div", className, delay = 0, stagger, children, id }: RevealProps) {
  const ref = useRef<HTMLElement>(null)
  const phase = useReveal(ref)
  const style: CSSProperties | undefined =
    delay && !stagger ? ({ "--reveal-delay": `${delay}ms` } as CSSProperties) : undefined
  const body =
    stagger === undefined ? (
      children
    ) : (
      <Group.Provider value={{ phase, stagger }}>{children}</Group.Provider>
    )
  return createElement(
    as,
    {
      ref,
      id,
      className: cn(className, !stagger && revealClass(phase)),
      style,
    },
    body
  )
}

type RevealItemProps = {
  as?: Tag
  className?: string
  /** Its place in the stagger, 0-based. */
  index: number
  children: ReactNode
}

/** A child of a staggered `Reveal`: rises `index × stagger` ms after the group comes into view. */
export function RevealItem({ as = "div", className, index, children }: RevealItemProps) {
  const group = useContext(Group)
  const phase = group?.phase ?? "static"
  const style: CSSProperties | undefined =
    group && phase !== "static"
      ? ({ "--reveal-delay": `${index * group.stagger}ms` } as CSSProperties)
      : undefined
  return createElement(as, { className: cn(className, revealClass(phase)), style }, children)
}

export function revealClass(phase: RevealPhase): string | false {
  return phase !== "static" && cn("reveal", phase === "hidden" && "reveal-hidden")
}
