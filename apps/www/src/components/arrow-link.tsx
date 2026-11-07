import { Icon } from "@repo/ui/components/icon"
import { cn } from "@/lib/utils"

type ArrowLinkProps = {
  href: string
  label: string
  className?: string
}

/** A dark square arrow with a label beside it: the site's quiet secondary call to action. The arrow nudges on hover. */
export function ArrowLink({ href, label, className }: ArrowLinkProps) {
  return (
    <a
      href={href}
      className={cn(
        "arrow-link group inline-flex items-center gap-4 rounded-full font-medium text-foreground outline-none transition-transform duration-200 focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary text-primary-foreground transition-transform duration-300 ease-out motion-safe:group-hover:translate-x-1 motion-safe:group-focus-visible:translate-x-1"
      >
        <Icon
          icon="lucide:arrow-right"
          className="size-5 transition-transform duration-300 ease-out motion-safe:group-hover:translate-x-0.5"
        />
      </span>
      {label}
    </a>
  )
}
