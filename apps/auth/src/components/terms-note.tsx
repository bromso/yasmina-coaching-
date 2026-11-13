import { useTranslations } from "next-intl"

/**
 * The consent line under the sign-in and sign-up forms. The terms and the privacy policy live on
 * the legal app, so the (server) view passes their URLs in the reader's language: `legalUrl`
 * cannot run in the browser.
 */
export function TermsNote({ termsHref, privacyHref }: { termsHref: string; privacyHref: string }) {
  const t = useTranslations("auth.common")
  return (
    <div className="text-balance text-center text-muted-foreground text-xs [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
      {t.rich("terms", {
        terms: (chunks) => <a href={termsHref}>{chunks}</a>,
        privacy: (chunks) => <a href={privacyHref}>{chunks}</a>,
      })}
    </div>
  )
}
