import { ArrowLink } from "@repo/ui/components/arrow-link"
import { Reveal } from "@repo/ui/components/motion/reveal"
import { Picture } from "@repo/ui/components/picture"
import { SunPanel } from "@repo/ui/components/sun-panel"
import type { HomeContent } from "@/content/home"
import type { MediaImage } from "@/content/media"

type StatementSectionProps = HomeContent["statement"] & {
  /** The wide photo under the text, and its caption. */
  image: MediaImage
  caption: string
}

/**
 * One sentence in large serif, a short paragraph and the arrow onward; below them a wide photo
 * of a session, in a card with the site's corners.
 */
export function StatementSection({ title, body, link, image, caption }: StatementSectionProps) {
  return (
    <section aria-labelledby="statement-title" className="container py-24 lg:py-32">
      <Reveal className="grid gap-10 lg:grid-cols-12 lg:items-end">
        <h2
          id="statement-title"
          className="text-balance text-4xl sm:text-5xl lg:col-span-7 lg:text-6xl"
        >
          {title}
        </h2>
        <div className="flex flex-col gap-8 lg:col-span-5">
          <p className="text-pretty text-lg text-muted-foreground">{body}</p>
          <ArrowLink href={link.href} label={link.label} />
        </div>
      </Reveal>
      <Reveal as="figure" className="mt-16 lg:mt-24">
        <SunPanel className="overflow-hidden">
          <Picture
            image={image}
            sizes="(min-width: 1400px) 1336px, 100vw"
            className="aspect-[4/3] w-full object-cover sm:aspect-[16/9] lg:aspect-[21/9]"
          />
        </SunPanel>
        <figcaption className="mt-4 text-muted-foreground text-sm">{caption}</figcaption>
      </Reveal>
    </section>
  )
}
