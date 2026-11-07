import { Avatar, AvatarFallback, AvatarImage } from "@repo/ui/components/avatar"
import { cn } from "@repo/ui/lib/utils"
import { useId } from "react"
import { SectionHeading, type SectionHeadingProps } from "../components/section-heading"

export type Testimonial = {
  quote: string
  name: string
  role?: string
  avatar?: { src?: string; initials: string }
}

export type TestimonialsProps = {
  heading?: SectionHeadingProps
  items: Testimonial[]
  id?: string
  className?: string
}

/** A heading plus a grid of quote cards, each a `<figure>`. */
export function Testimonials({ heading, items, id, className }: TestimonialsProps) {
  const headingId = useId()
  return (
    <section
      id={id}
      aria-labelledby={heading ? headingId : undefined}
      className={cn("container py-20", className)}
    >
      {heading && <SectionHeading {...heading} id={headingId} />}
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {items.map((item) => (
          <figure key={item.name} className="rounded-lg border p-6">
            <blockquote className="text-pretty">{item.quote}</blockquote>
            <figcaption className="mt-4 flex items-center gap-3">
              {item.avatar && (
                <Avatar className="size-9">
                  {item.avatar.src && <AvatarImage src={item.avatar.src} alt="" />}
                  <AvatarFallback>{item.avatar.initials}</AvatarFallback>
                </Avatar>
              )}
              <div>
                <div className="font-medium text-sm">{item.name}</div>
                {item.role && <div className="text-muted-foreground text-xs">{item.role}</div>}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
