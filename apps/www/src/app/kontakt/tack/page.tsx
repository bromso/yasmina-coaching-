import { siteUrl } from "@repo/sites"
import type { Metadata } from "next"
import { contactFor } from "@/content/contact"
import { parseDone } from "@/lib/leads"
import { getLocale } from "@/lib/locale"
import { ContactDoneView } from "@/views/contact-done-view"

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: contactFor(await getLocale()).meta.doneTitle,
    robots: { index: false, follow: false },
  }
}

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

/**
 * Everything in the query string is untrusted: the reference is shown as text (cut to a sane
 * length) and the next step is picked from the page's own copy by the three answers, only when
 * all three are known options (`parseDone`), never written from the query.
 */
export default async function Page({ searchParams }: PageProps) {
  const [query, locale] = await Promise.all([searchParams, getLocale()])
  const { reference, answers } = parseDone(query)
  return (
    <ContactDoneView
      reference={reference}
      answers={answers}
      blogUrl={siteUrl("blog")}
      locale={locale}
    />
  )
}
