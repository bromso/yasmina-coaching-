import { Eyebrow } from "@repo/ui/components/eyebrow"
import { MediaClip } from "@repo/ui/components/motion/media-clip"
import { Reveal, RevealItem } from "@repo/ui/components/motion/reveal"
import { Picture } from "@repo/ui/components/picture"
import { PauseIcon, PlayIcon } from "@/components/clip-icons"
import type { HomeContent } from "@/content/home"
import type { MediaClip as Clip, MediaImage, MediaText } from "@/content/media"

type WhySectionProps = HomeContent["why"] & {
  id: string
  /** The park clip, and the park photo as its still. */
  clip: Clip
  still: MediaImage
  clipLabels: MediaText["clip"]
}

/**
 * The portrait beside three short reasons, each with its own serif heading. The portrait is a
 * short clip of Yasmina in a park, over the park photo as its still (the server's HTML, and all
 * there is under reduced motion or without JavaScript), with a pause button over its corner.
 */
export function WhySection({ id, heading, reasons, clip, still, clipLabels }: WhySectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-(--sticky-header-offset) container py-24 lg:py-32"
    >
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <Reveal className="lg:col-span-5">
          <MediaClip
            src={clip.src}
            poster={`/media/${clip.poster.name}.jpg`}
            width={clip.width}
            height={clip.height}
            labels={clipLabels}
            icons={{ play: <PlayIcon />, pause: <PauseIcon /> }}
            className="aspect-[3/4] w-full overflow-hidden rounded-4xl bg-sun-soft"
            mediaClassName="object-[50%_20%]"
            still={
              <Picture
                image={still}
                sizes="(min-width: 1400px) 540px, (min-width: 1024px) 40vw, 100vw"
                className="size-full object-cover object-[50%_20%]"
              />
            }
          />
        </Reveal>
        <div className="flex flex-col justify-center lg:col-span-7 lg:pl-8">
          <Reveal delay={120}>
            <Eyebrow>{heading.eyebrow}</Eyebrow>
            <h2 id={`${id}-title`} className="mt-5 text-balance text-4xl sm:text-5xl">
              {heading.title}
            </h2>
          </Reveal>
          <Reveal as="dl" stagger={100} className="mt-10 divide-y divide-border">
            {reasons.map((reason, i) => (
              <RevealItem
                key={reason.title}
                as="div"
                index={i + 2}
                className="grid gap-2 py-6 sm:grid-cols-[8rem_1fr] sm:gap-6"
              >
                <dt className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em] sm:pt-1">
                  {reason.title}
                </dt>
                <dd className="text-pretty text-foreground leading-relaxed">
                  {reason.description}
                </dd>
              </RevealItem>
            ))}
          </Reveal>
        </div>
      </div>
    </section>
  )
}
