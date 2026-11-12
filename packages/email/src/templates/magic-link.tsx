import { Button, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { BRAND, button, EmailHeading, EmailLink, Layout } from "./layout"

export type MagicLinkProps = { link: string; brand?: string; locale?: Locale }

export const magicLinkSubject = "Your sign-in link"

/** Minutes the link stays usable; matches `apps/api`'s `MAGIC_TTL_MS`. */
const MINUTES = 15

export function MagicLink({ link, brand, locale = DEFAULT_LOCALE }: MagicLinkProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout preview={t("magicLink.preview")} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("magicLink.heading", { brand: brand ?? BRAND })}</EmailHeading>
      <Text>{t("magicLink.body", { minutes: MINUTES })}</Text>
      <Button href={link} style={button}>
        {t("magicLink.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <EmailLink href={link}>{link}</EmailLink>
      </Text>
      <Text>{t("magicLink.footer")}</Text>
    </Layout>
  )
}
