import { ctaPill } from "@repo/ui/components/cta-pill"
import { SunPanel } from "@repo/ui/components/sun-panel"
import type { BlogUi } from "@/content/ui"

/** The close of every post: a sun panel inviting the reader to ask for the free intro call on
 * www (its contact page, `/kontakt`; `/book` lists the paid sessions). */
export function CallToAction({ ui, href }: { ui: BlogUi; href: string }) {
  return (
    <SunPanel
      as="section"
      tone="sun"
      aria-labelledby="call-to-action"
      className="flex flex-col items-start gap-4 px-6 py-10 md:px-12 md:py-12"
    >
      <h2 id="call-to-action" className="max-w-xl text-balance text-3xl md:text-4xl">
        {ui.cta.title}
      </h2>
      <p className="max-w-xl text-balance md:text-lg">{ui.cta.text}</p>
      <a href={href} className={ctaPill({ size: "lg" })}>
        {ui.cta.button}
      </a>
    </SunPanel>
  )
}
