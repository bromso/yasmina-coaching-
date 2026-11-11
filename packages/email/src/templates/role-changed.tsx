import { Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { EmailHeading, greeting, Layout } from "./layout"
import { NotificationFooter, type NotificationLinks } from "./notification-footer"

export type RoleChangedProps = NotificationLinks & {
  name?: string
  workspaceName: string
  /** The recipient's new role (`viewer`, `member`, `admin` or `owner`). */
  role: string
  brand?: string
  locale?: Locale
}

/** The English subject (tests and e2e match mail by it). */
export const roleChangedSubject = (workspaceName: string) => `Your role in ${workspaceName} changed`

/**
 * An optional notification mail (`member.role_changed`): someone else changed the recipient's
 * role. Names the workspace and the new role only — never who changed it or any other member.
 */
export function RoleChanged({
  name,
  workspaceName,
  role,
  inboxUrl,
  unsubscribeUrl,
  brand,
  locale = DEFAULT_LOCALE,
}: RoleChangedProps) {
  const t = translatorFor(locale, "email")
  const values = { workspace: workspaceName, role }
  return (
    <Layout preview={t("roleChanged.preview", values)} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("roleChanged.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("roleChanged.body", values)}</Text>
      <NotificationFooter t={t} inboxUrl={inboxUrl} unsubscribeUrl={unsubscribeUrl} />
    </Layout>
  )
}
