import { Heading, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { greeting, Layout } from "./layout"
import { NotificationFooter, type NotificationLinks } from "./notification-footer"

export type RemovedFromWorkspaceProps = NotificationLinks & {
  name?: string
  workspaceName: string
  brand?: string
  locale?: Locale
}

/** The English subject (tests and e2e match mail by it). */
export const removedFromWorkspaceSubject = (workspaceName: string) =>
  `You were removed from ${workspaceName}`

/**
 * An optional notification mail (`member.removed`): someone else removed the recipient from a
 * workspace. Names the workspace only — never who removed them or any other member.
 */
export function RemovedFromWorkspace({
  name,
  workspaceName,
  inboxUrl,
  unsubscribeUrl,
  brand,
  locale = DEFAULT_LOCALE,
}: RemovedFromWorkspaceProps) {
  const t = translatorFor(locale, "email")
  const values = { workspace: workspaceName }
  return (
    <Layout preview={t("removedFromWorkspace.preview", values)} brand={brand} locale={locale}>
      <Heading as="h1">{t("removedFromWorkspace.heading")}</Heading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("removedFromWorkspace.body", values)}</Text>
      <NotificationFooter t={t} inboxUrl={inboxUrl} unsubscribeUrl={unsubscribeUrl} />
    </Layout>
  )
}
