import { Icon } from "@repo/ui/components/icon"
import { Picture } from "@repo/ui/components/picture"
import type { MediaImage } from "@/content/media"

type ServiceCardProps = {
  href: string
  title: string
  lead: string
  image: MediaImage
  /** "Läs mer": shown, not announced; the title is the link's name. */
  more: string
}

/**
 * One of the four services on the hub: its photo, title and lead in a rounded card. The title is
 * the link and stretches over the whole card, so the card is one tab stop with a short name; the
 * card lifts a touch on hover and shows the focus ring when the link has focus.
 */
export function ServiceCard({ href, title, lead, image, more }: ServiceCardProps) {
  return (
    <article className="relative flex h-full flex-col gap-5 rounded-4xl bg-sun-soft p-5 transition-transform duration-300 ease-out has-[a:focus-visible]:ring-[3px] has-[a:focus-visible]:ring-ring/50 motion-safe:group-hover:-translate-y-1 sm:p-6">
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-background/60">
        <Picture
          image={image}
          small
          className="size-full object-cover object-[50%_25%] transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.04]"
        />
      </div>
      <h3 className="hyphens-auto break-words font-display text-2xl leading-tight">
        <a href={href} className="outline-none after:absolute after:inset-0 after:rounded-4xl">
          {title}
        </a>
      </h3>
      <p className="text-muted-foreground text-sm leading-relaxed">{lead}</p>
      <span
        aria-hidden="true"
        className="mt-auto inline-flex items-center gap-2 font-medium text-sm"
      >
        {more}
        <Icon icon="lucide:arrow-right" className="size-4" />
      </span>
    </article>
  )
}
