import { Button, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, EmailHeading, EmailLink, greeting, Layout } from "./layout"

export type WorkspaceTwoFactorRequiredProps = {
  name?: string
  workspaceName: string
  /** The account's Security page (`${ACCOUNT_URL}/security`), where two-step is turned on. */
  link: string
  brand?: string
  locale?: Locale
}

export const workspaceTwoFactorRequiredSubject = "Two-step verification is now required"

/**
 * Sent by `workspaces.security.set` when the owner turns the requirement on, to every member who
 * has neither two-step verification on nor a passkey. Names the workspace only — never the owner
 * or any other member.
 */
export function WorkspaceTwoFactorRequired({
  name,
  workspaceName,
  link,
  brand,
  locale = DEFAULT_LOCALE,
}: WorkspaceTwoFactorRequiredProps) {
  const t = translatorFor(locale, "email")
  const values = { workspace: workspaceName }
  return (
    <Layout preview={t("workspaceTwoFactorRequired.preview", values)} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("workspaceTwoFactorRequired.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("workspaceTwoFactorRequired.body", values)}</Text>
      <Text>{t("workspaceTwoFactorRequired.action")}</Text>
      <Button href={link} style={button}>
        {t("workspaceTwoFactorRequired.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <EmailLink href={link}>{link}</EmailLink>
      </Text>
    </Layout>
  )
}
