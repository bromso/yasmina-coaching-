import { cn } from "@repo/ui/lib/utils"

export type SectionHeadingProps = {
  eyebrow?: string
  title: string
  description?: string
  align?: "center" | "start"
  className?: string
  /** Set by blocks so the section can be labelled by its heading. */
  id?: string
}

/** The eyebrow / title / description trio every landing block starts with. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  className,
  id,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex max-w-2xl flex-col gap-3",
        align === "center" && "mx-auto text-center",
        className
      )}
    >
      {eyebrow && (
        <span className="font-medium text-muted-foreground text-sm uppercase tracking-wider">
          {eyebrow}
        </span>
      )}
      <h2 id={id} className="text-balance font-semibold text-3xl tracking-tight md:text-4xl">
        {title}
      </h2>
      {description && (
        <p className="text-balance text-muted-foreground md:text-lg">{description}</p>
      )}
    </div>
  )
}
