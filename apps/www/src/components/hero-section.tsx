import { Button } from "@repo/ui/components/button"
import { Eyebrow } from "@repo/ui/components/eyebrow"
import { Icon } from "@repo/ui/components/icon"
import { MediaClip } from "@repo/ui/components/motion/media-clip"
import { Picture } from "@repo/ui/components/picture"
import { SunPanel } from "@repo/ui/components/sun-panel"
import { PauseIcon, PlayIcon } from "@/components/clip-icons"
import type { HomeContent } from "@/content/home"
import type { MediaClip as Clip, MediaText } from "@/content/media"

type HeroSectionProps = HomeContent["hero"] & {
  /** The lobby clip, its poster's alt text in the page's language. */
  clip: Clip
  /** The clip toggle's names. */
  clipLabels: MediaText["clip"]
}

/**
 * The entrance: each piece rises in turn, 90 ms apart. CSS keyframes, `motion-safe` only, so it
 * also plays without JavaScript and never under reduced motion. Literal class names: Tailwind
 * finds them by scanning the source.
 */
const RISE = [
  "motion-safe:animate-rise",
  "motion-safe:animate-rise motion-safe:[animation-delay:90ms]",
  "motion-safe:animate-rise motion-safe:[animation-delay:180ms]",
  "motion-safe:animate-rise motion-safe:[animation-delay:270ms]",
  "motion-safe:animate-rise motion-safe:[animation-delay:360ms]",
] as const
const rise = (step: 0 | 1 | 2 | 3 | 4) => RISE[step]

/**
 * The opening card: the lobby clip fills it from `lg` up with the copy, and the stats row under
 * it, in the faded left column; below `lg` the clip sits on top and the copy underneath. The clip's poster is the server's HTML (and the LCP image), the `<video>` arrives with
 * JavaScript where motion is welcome, and the round button over the corner pauses it.
 */
export function HeroSection({
  eyebrow,
  title,
  description,
  primary,
  secondary,
  stats,
  clip,
  clipLabels,
}: HeroSectionProps) {
  return (
    <SunPanel
      as="section"
      aria-labelledby="hero-title"
      className="relative mx-2.5 mt-2.5 overflow-hidden lg:mx-4 lg:min-h-[min(88vh,56rem)]"
    >
      {/*
        From lg up the clip fills the whole card, untouched where Yasmina walks (the middle and
        the right); below lg it sits on top of the copy. Two fades only: one on the left so the
        headline keeps its contrast, one at the bottom so the card melts into the page instead of
        ending on the lobby floor.
      */}
      <MediaClip
        src={clip.src}
        poster={`/media/${clip.poster.name}.jpg`}
        width={clip.width}
        height={clip.height}
        labels={clipLabels}
        icons={{ play: <PlayIcon />, pause: <PauseIcon /> }}
        className="aspect-[4/3] w-full sm:aspect-[16/10] lg:absolute lg:inset-0 lg:aspect-auto lg:h-full"
        mediaClassName="object-[50%_35%]"
        toggleClassName="top-4 right-4 lg:top-6 lg:right-6"
        still={
          <Picture
            image={clip.poster}
            priority
            sizes="100vw"
            className="size-full object-cover object-[50%_35%]"
          />
        }
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden bg-linear-to-r from-background from-0% via-background/80 via-32% to-transparent to-58% lg:block"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-36 bg-linear-to-t from-background to-transparent lg:block"
      />
      <div className="relative flex flex-col px-6 py-10 sm:px-10 lg:min-h-[min(88vh,56rem)] lg:justify-center lg:px-16 lg:py-16">
        <div className="max-w-xl">
          <Eyebrow className={rise(0)}>{eyebrow}</Eyebrow>
          <h1
            id="hero-title"
            className={`mt-5 text-balance text-5xl text-foreground sm:text-6xl lg:text-7xl ${rise(1)}`}
          >
            {title}
          </h1>
          <p className={`mt-6 max-w-lg text-pretty text-lg text-muted-foreground ${rise(2)}`}>
            {description}
          </p>
          <div className={`mt-8 flex flex-wrap items-center gap-3 ${rise(3)}`}>
            <Button asChild size="lg" className="h-12 px-6 text-base">
              <a href={primary.href}>
                {primary.label}
                <Icon icon="lucide:arrow-right" aria-hidden="true" />
              </a>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="h-12 bg-background/70 px-6 text-base backdrop-blur"
            >
              <a href={secondary.href}>{secondary.label}</a>
            </Button>
          </div>
          <dl
            className={`mt-12 grid grid-cols-1 gap-5 border-foreground/20 border-t pt-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-foreground/20 dark:border-border/70 dark:sm:divide-border/70 ${rise(4)}`}
          >
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col sm:px-5 sm:first:pl-0">
                <dt className="order-last text-muted-foreground text-sm">{stat.label}</dt>
                <dd className="font-display text-2xl text-foreground">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </SunPanel>
  )
}
