import { cn } from "@repo/ui/lib/utils"
import { type ReactNode, useId } from "react"

export type Logo = { name: string; src?: string; node?: ReactNode }

export type LogoCloudProps = {
  title?: string
  logos: Logo[]
  id?: string
  className?: string
}

/** A logo strip under an optional caption. Not a document section heading — see the `<p>` below. */
export function LogoCloud({ title, logos, id, className }: LogoCloudProps) {
  const headingId = useId()
  return (
    <section
      id={id}
      aria-labelledby={title ? headingId : undefined}
      className={cn("container py-12", className)}
    >
      {title && (
        <p id={headingId} className="mb-8 text-center text-muted-foreground text-sm">
          {title}
        </p>
      )}
      <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-70 grayscale">
        {logos.map((logo) => (
          <li key={logo.name} className="flex h-8 items-center">
            {logo.src ? (
              <img src={logo.src} alt={logo.name} className="h-full w-auto" />
            ) : (
              <>
                <span aria-hidden="true" className="h-full [&>svg]:h-full [&>svg]:w-auto">
                  {logo.node}
                </span>
                <span className="sr-only">{logo.name}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
