import { Button, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { BRAND, button, EmailHeading, EmailLink, Layout } from "./layout"

export type InvitationProps = {
  workspaceName: string
  inviterName: string
  role: string
  link: string
  brand?: string
  locale?: Locale
}

export const invitationSubject = (workspaceName: string) => `You're invited to ${workspaceName}`

/** Days the invitation link stays usable; matches `apps/api`'s `INVITE_TTL_MS`. */
const DAYS = 7

export function Invitation({
  workspaceName,
  inviterName,
  role,
  link,
  brand,
  locale = DEFAULT_LOCALE,
}: InvitationProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout
      preview={t("invitation.preview", { inviter: inviterName, workspace: workspaceName })}
      brand={brand}
      locale={locale}
    >
      <EmailHeading as="h1">
        {t("invitation.heading", { workspace: workspaceName, brand: brand ?? BRAND })}
      </EmailHeading>
      <Text>
        {t("invitation.body", { inviter: inviterName, workspace: workspaceName, role, days: DAYS })}
      </Text>
      <Button href={link} style={button}>
        {t("invitation.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <EmailLink href={link}>{link}</EmailLink>
      </Text>
      <Text>{t("invitation.footer")}</Text>
    </Layout>
  )
}
