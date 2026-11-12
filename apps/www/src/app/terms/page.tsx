import { permanentRedirect } from "next/navigation"
import { legalTarget } from "@/lib/legal-redirect"
import { getLocale } from "@/lib/locale"

/** Moved to the legal app; a reader with `locale=en` lands on its English page. */
export default async function Page(): Promise<never> {
  permanentRedirect(legalTarget("terms", await getLocale()))
}
