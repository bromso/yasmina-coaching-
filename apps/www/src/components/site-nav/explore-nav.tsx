"use client"

import { siteHeaderBar } from "@repo/ui/blocks/site-header-shell"
import { Carousel, CarouselContent, CarouselItem, useCarousel } from "@repo/ui/components/carousel"
import { ctaPill } from "@repo/ui/components/cta-pill"
import { Icon } from "@repo/ui/components/icon"
import { LazyMotion, MotionConfig, m } from "motion/react"
import { usePathname } from "next/navigation"
import { type ReactNode, useEffect, useId, useRef, useState } from "react"
import { cn } from "@/lib/utils"

export type ExploreNavLink = { label: string; href: string }

export type ExploreNavOffering = {
  key: string
  label: string
  /** A short line under the label: "60 min", "6 samtal", "Förfrågan". */
  hint: string
  href: string
  image: { webp: string; jpg: string; width: number; height: number }
}

export type ExploreNavLabels = {
  /** The nav landmark's name. */
  nav: string
  /** The closed bar's toggle text. */
  explore: string
  /** The open panel's round close button. */
  close: string
  /** The carousel's accessible name. */
  offerings: string
  previous: string
  next: string
  /** Under the offering whose page is open. */
  current: string
  /** The heading over the section chips. */
  overview: string
}

type ExploreNavProps = {
  brand: ExploreNavLink
  book: ExploreNavLink
  /** The line beside the big "Boka" when open: what booking starts with. */
  bookNote: { title: string; detail: string }
  sections: ExploreNavLink[]
  offerings: ExploreNavOffering[]
  /** The blue links at the bottom of the panel (sign in, contact). */
  links: ExploreNavLink[]
  /** Server-rendered controls (theme, language), shown in the open panel. */
  controls: ReactNode
  labels: ExploreNavLabels
}

/** Layout animations need the `domMax` feature set; it loads after the page, never in its first JS. */
const loadFeatures = () => import("motion/react").then((mod) => mod.domMax)

/** The close button's "+" turned 45°: drawn inline, so it never waits on the icon API. */
function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function CarouselArrows({ previous, next }: { previous: string; next: string }) {
  const { scrollPrev, scrollNext, canScrollPrev, canScrollNext } = useCarousel()
  const arrow =
    "absolute top-1/2 flex size-10 -translate-y-1/2 items-center rounded-full text-foreground outline-none transition-opacity focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-safe:active:scale-95"
  return (
    <>
      <button
        type="button"
        className={cn(arrow, "left-0 -translate-x-full justify-end", !canScrollPrev && "opacity-0")}
        disabled={!canScrollPrev}
        onClick={scrollPrev}
      >
        <Icon icon="lucide:chevron-left" className="size-5" aria-hidden="true" />
        <span className="sr-only">{previous}</span>
      </button>
      <button
        type="button"
        className={cn(arrow, "right-0 translate-x-full", !canScrollNext && "opacity-0")}
        disabled={!canScrollNext}
        onClick={scrollNext}
      >
        <Icon icon="lucide:chevron-right" className="size-5" aria-hidden="true" />
        <span className="sr-only">{next}</span>
      </button>
    </>
  )
}

/**
 * The site's navigation: a floating pill with the name, "Utforska" and "Boka". "Utforska" grows
 * the pill into a panel — every way to work with Yasmina as a photo carousel, the page's
 * sections as chips, sign-in and contact, the theme and language controls — and "Boka" glides
 * from the bar into the panel. Escape or the round button closes it and focus returns to the
 * toggle. Springs only where motion is welcome (`reducedMotion="user"`); without JavaScript the
 * bar still carries the name, "Boka" and the section links.
 */
export function ExploreNav({
  brand,
  book,
  bookNote,
  sections,
  offerings,
  links,
  controls,
  labels,
}: ExploreNavProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const toggleRef = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()

  // A link inside the panel moved the page (or its hash): fold the panel away.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the path change is the trigger
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      // A menu inside the panel (the language menu) already handled this Escape: it closes alone.
      if (event.key !== "Escape" || event.defaultPrevented) return
      setOpen(false)
      toggleRef.current?.focus()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const close = () => setOpen(false)

  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig
        reducedMotion="user"
        transition={{ type: "spring", stiffness: open ? 200 : 350, damping: open ? 30 : 40 }}
      >
        <m.nav
          aria-label={labels.nav}
          initial={false}
          // Inline, so the layout animation can correct the corners while the pill scales: the
          // closed bar's radius is the token `siteHeaderBar` draws with.
          animate={{ borderRadius: open ? 28 : "var(--site-header-radius)" }}
          layout
          className={cn(
            siteHeaderBar,
            open ? "max-h-[calc(100dvh-1.5rem)] overflow-y-auto" : "overflow-hidden"
          )}
        >
          <div className="flex min-h-8 w-full items-center justify-between gap-3 px-4">
            <div className="min-w-0">
              {!open && (
                <m.a
                  layout
                  layoutId="explore-nav-title"
                  href={brand.href}
                  className="block truncate rounded-md font-display text-xl leading-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {brand.label}
                </m.a>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <m.button
                ref={toggleRef}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                aria-label={open ? labels.close : undefined}
                initial={false}
                animate={{
                  width: open ? 42 : 84,
                  height: open ? 42 : 30,
                  borderRadius: 999,
                  backgroundColor: open ? "var(--foreground)" : "rgba(0,0,0,0)",
                }}
                transition={{ width: { duration: 0.2 } }}
                onClick={() => setOpen((value) => !value)}
                className={cn(
                  "flex items-center justify-center border text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  open
                    ? "border-foreground/80 text-background"
                    : "border-border text-foreground transition-colors hover:bg-muted"
                )}
              >
                {open ? (
                  <m.span
                    initial={{ opacity: 0, filter: "blur(4px)" }}
                    animate={{ opacity: 1, filter: "blur(0px)" }}
                    transition={{ duration: 0.3 }}
                    className="flex rotate-45 items-center justify-center"
                  >
                    <PlusIcon />
                  </m.span>
                ) : (
                  <span>{labels.explore}</span>
                )}
              </m.button>
              {!open && (
                <m.a
                  layoutId="explore-nav-book"
                  href={book.href}
                  className={ctaPill({ size: "sm" })}
                >
                  <m.span layoutId="explore-nav-book-text">{book.label}</m.span>
                </m.a>
              )}
            </div>
          </div>

          {open && (
            <m.div id={panelId} layout className="px-8 pt-5 lg:px-14">
              <m.div
                initial={{ opacity: 0, y: -24 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 border-foreground/10 border-b pb-6"
              >
                <Carousel
                  opts={{ align: "start" }}
                  aria-label={labels.offerings}
                  className="w-full [&_[data-slot='carousel-content']]:overflow-x-clip [&_[data-slot='carousel-content']]:overflow-y-visible"
                >
                  <CarouselContent className="-ml-2 md:-ml-4">
                    {offerings.map((offering, index) => {
                      const current = pathname === offering.href
                      return (
                        <CarouselItem
                          key={offering.key}
                          className="basis-[42%] pl-2 sm:basis-1/4 md:basis-1/5 md:pl-4 lg:basis-1/6"
                        >
                          <m.a
                            href={offering.href}
                            onClick={close}
                            aria-current={current ? "page" : undefined}
                            initial={{ opacity: 0, y: -32 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              type: "spring",
                              duration: 0.4,
                              bounce: 0,
                              delay: index * 0.03,
                            }}
                            className="group flex flex-col items-center rounded-2xl p-1 text-center outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                          >
                            <picture className="block w-full overflow-hidden rounded-xl">
                              <source srcSet={offering.image.webp} type="image/webp" />
                              <img
                                src={offering.image.jpg}
                                width={offering.image.width}
                                height={offering.image.height}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="aspect-[4/3] w-full object-cover transition-transform duration-300 ease-out motion-safe:group-hover:scale-[1.05]"
                              />
                            </picture>
                            <span className="w-full hyphens-auto break-words pt-3 font-medium text-xs leading-tight sm:text-sm">
                              {offering.label}
                            </span>
                            <span
                              className={cn(
                                "text-xs",
                                current ? "text-foreground" : "text-muted-foreground"
                              )}
                            >
                              {current ? labels.current : offering.hint}
                            </span>
                          </m.a>
                        </CarouselItem>
                      )
                    })}
                  </CarouselContent>
                  <CarouselArrows previous={labels.previous} next={labels.next} />
                </Carousel>
              </m.div>

              <div className="flex w-full flex-col justify-between gap-4 lg:flex-row lg:items-end">
                <m.a
                  layoutId="explore-nav-title"
                  href={brand.href}
                  onClick={close}
                  className="w-fit rounded-md font-display text-3xl leading-tight outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:text-[40px]"
                >
                  {brand.label}
                </m.a>
                <div className="flex w-full items-center justify-between gap-6 lg:w-fit">
                  <m.div
                    initial={{ opacity: 0, y: -24 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm lg:text-right"
                  >
                    <b className="font-medium">{bookNote.title}</b>
                    <p className="text-muted-foreground">{bookNote.detail}</p>
                  </m.div>
                  <m.a
                    layoutId="explore-nav-book"
                    href={book.href}
                    onClick={close}
                    className={ctaPill({ size: "lg", className: "shrink-0" })}
                  >
                    <m.span layoutId="explore-nav-book-text" className="text-lg">
                      {book.label}
                    </m.span>
                  </m.a>
                </div>
              </div>

              <m.div
                initial={{ opacity: 0, y: -24 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-6 p-2 lg:p-5"
              >
                <p className="flex items-center gap-2 text-muted-foreground lg:text-xl">
                  {labels.overview}
                  <Icon icon="lucide:chevron-down" className="size-4" aria-hidden="true" />
                </p>
                <ul className="mt-5 flex max-w-2xl flex-wrap gap-2 lg:mt-6">
                  {sections.map((section) => (
                    <li key={section.href}>
                      <a
                        href={section.href}
                        onClick={close}
                        className="block rounded-full px-5 py-2 text-center font-medium outline-none transition-colors duration-200 hover:bg-foreground hover:text-background focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:text-lg [li:first-child>&]:bg-foreground [li:first-child>&]:text-background"
                      >
                        {section.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </m.div>

              <m.div
                initial={{ opacity: 0, y: -24 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 flex flex-col gap-6 p-2 sm:flex-row sm:items-end sm:justify-between lg:p-5"
              >
                <ul className="space-y-4">
                  {links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        onClick={close}
                        className="group inline-flex items-center gap-2 rounded-md font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 lg:text-[19px]"
                      >
                        {link.label}
                        <Icon
                          icon="lucide:chevron-right"
                          className="size-4 transition-transform duration-200 motion-safe:group-hover:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </a>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-2">{controls}</div>
              </m.div>
            </m.div>
          )}
        </m.nav>
      </MotionConfig>
    </LazyMotion>
  )
}
