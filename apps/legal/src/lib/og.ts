import type { LegalLocale } from "@repo/sites/legal"
import { OG_SIZE, ogImage } from "@repo/ui/lib/og"
import { UI } from "@/content/ui"

/** Each language's index OG/Twitter image: the app's name over its description. */
export function indexImage(locale: LegalLocale) {
  const ui = UI[locale]
  return {
    size: OG_SIZE,
    contentType: "image/png",
    alt: ui.title,
    Image() {
      return ogImage({ title: ui.title, subtitle: ui.description })
    },
  }
}
