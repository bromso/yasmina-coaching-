import type { BlogUi } from "@/content/ui"

/** The close of every post: a sun panel inviting the reader to ask for the free intro call on
 * www (its contact form, `/#contact`; `/book` lists the paid sessions). */
export function CallToAction({ ui, href }: { ui: BlogUi; href: string }) {
  return (
    <section
      aria-labelledby="call-to-action"
      className="flex flex-col items-start gap-4 rounded-4xl bg-sun px-6 py-10 md:px-12 md:py-12"
    >
      <h2 id="call-to-action" className="max-w-xl text-balance text-3xl md:text-4xl">
        {ui.cta.title}
      </h2>
      <p className="max-w-xl text-balance md:text-lg">{ui.cta.text}</p>
      <a
        href={href}
        className="inline-flex h-11 items-center rounded-full bg-primary px-5 text-primary-foreground tracking-[0.035em] outline-none transition-colors hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {ui.cta.button}
      </a>
    </section>
  )
}
