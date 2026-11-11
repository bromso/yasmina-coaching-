"use client"

import { cn } from "@repo/ui/lib/utils"
import { type ReactNode, useEffect, useRef, useState } from "react"

type MediaClipProps = {
  /** The MP4, muted; plays once and rests on its last frame unless `loop` is set. */
  src: string
  loop?: boolean
  /** The `<video poster>`: the frame it shows before playing. */
  poster: string
  width: number
  height: number
  /**
   * The server-rendered still, a `<Picture>`: what every reader sees before hydration, without
   * JavaScript, and under reduced motion. The video, once playing, fades in over it.
   */
  still: ReactNode
  /** The toggle's names: `play` while paused, `pause` while playing. */
  labels: { play: string; pause: string }
  /** The toggle's visible icons. */
  icons: { play: ReactNode; pause: ReactNode }
  className?: string
  /** Goes on the `<video>` (and must size it like the still, which it covers). */
  mediaClassName?: string
  /** Where the round toggle sits over the frame. */
  toggleClassName?: string
}

const NO_PREFERENCE = "(prefers-reduced-motion: no-preference)"

/**
 * A short silent clip over its still. It only plays by itself where the visitor has not asked
 * for less motion (`prefers-reduced-motion`), and even then the round button over the corner
 * pauses it (WCAG 2.2.2: anything moving for more than five seconds must be pausable). Under
 * reduced motion the still shows and the same button starts the clip on request. The `<video>`
 * is not in the server HTML at all: the still is, so nothing flashes and nothing downloads
 * until the browser has decided to play. The clip plays once and rests on its last frame (no
 * endless loop in the corner of the eye); pressing play again starts it over.
 */
export function MediaClip({
  src,
  poster,
  width,
  height,
  still,
  labels,
  icons,
  className,
  mediaClassName,
  toggleClassName,
  loop = false,
}: MediaClipProps) {
  const video = useRef<HTMLVideoElement>(null)
  // `null` until mounted: the server renders the still only, so the toggle appears with JavaScript.
  const [wanted, setWanted] = useState<boolean | null>(null)
  const [playing, setPlaying] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const query = window.matchMedia(NO_PREFERENCE)
    setWanted(query.matches)
    // Turning reduced motion on while the page is open stops the clip, as a fresh load would.
    const onChange = (event: MediaQueryListEvent) => {
      if (!event.matches) {
        video.current?.pause()
        setWanted(false)
        setPlaying(false)
        setVisible(false)
      }
    }
    query.addEventListener("change", onChange)
    return () => query.removeEventListener("change", onChange)
  }, [])

  const toggle = () => {
    const el = video.current
    if (!el) {
      setWanted(true)
      return
    }
    if (el.paused) void el.play().catch(() => setPlaying(false))
    else el.pause()
  }

  return (
    <div className={cn("relative", className)}>
      {still}
      {wanted && (
        <video
          ref={video}
          src={src}
          poster={poster}
          width={width}
          height={height}
          autoPlay
          muted
          loop={loop}
          playsInline
          preload="metadata"
          disablePictureInPicture
          aria-hidden="true"
          tabIndex={-1}
          onPlaying={() => {
            setPlaying(true)
            setVisible(true)
          }}
          onPause={() => setPlaying(false)}
          // Played out: the last frame stays, the toggle offers to play it again from the start.
          onEnded={() => setPlaying(false)}
          className={cn(
            "absolute inset-0 size-full object-cover transition-opacity duration-500 ease-out",
            visible ? "opacity-100" : "opacity-0",
            mediaClassName
          )}
        />
      )}
      {wanted !== null && (
        <button
          type="button"
          onClick={toggle}
          aria-pressed={playing}
          aria-label={playing ? labels.pause : labels.play}
          className={cn(
            "absolute z-10 flex size-11 items-center justify-center rounded-full border border-border/60 bg-background/80 text-foreground shadow-sm backdrop-blur transition-[background-color,transform] duration-200 hover:bg-background motion-safe:active:scale-95",
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
            toggleClassName ?? "right-4 bottom-4"
          )}
        >
          {playing ? icons.pause : icons.play}
        </button>
      )}
    </div>
  )
}
