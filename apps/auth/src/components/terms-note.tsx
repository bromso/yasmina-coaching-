import { useTranslations } from "next-intl"

/**
 * The consent line under the sign-in and sign-up forms. Terms and Privacy live on the marketing
 * site, so the (server) view passes its URL: `siteUrl` cannot run in the browser.
 */
export function TermsNote({ legalBaseUrl }: { legalBaseUrl: string }) {
  const t = useTranslations("auth.common")
  return (
    <div className="text-balance text-center text-muted-foreground text-xs [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
      {t.rich("terms", {
        terms: (chunks) => <a href={`${legalBaseUrl}/terms`}>{chunks}</a>,
        privacy: (chunks) => <a href={`${legalBaseUrl}/privacy`}>{chunks}</a>,
      })}
    </div>
  )
}
