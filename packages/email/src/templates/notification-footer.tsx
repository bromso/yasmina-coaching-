import { Button, Link, Text } from "@react-email/components"
import { button, type Translator } from "./layout"

/** What every optional notification mail links to besides its own content. */
export type NotificationLinks = {
  /** The account's notification inbox (`${ACCOUNT_URL}/notifications`). */
  inboxUrl: string
  /**
   * The page that turns this one email type off (`${AUTH_URL}/email/unsubscribe?token=…`). The
   * same token rides in the mail's `List-Unsubscribe` header, set by apps/api.
   */
  unsubscribeUrl: string
}

/**
 * The inbox button and the visible "Turn off these emails" link every optional notification mail
 * ends with (RFC 8058 still asks for one in the body beside the header).
 */
export function NotificationFooter({
  t,
  inboxUrl,
  unsubscribeUrl,
}: NotificationLinks & { t: Translator }) {
  return (
    <>
      <Button href={inboxUrl} style={button}>
        {t("notificationEmail.inbox")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <Link href={inboxUrl}>{inboxUrl}</Link>
      </Text>
      <Text>
        {t("notificationEmail.why")}{" "}
        <Link href={unsubscribeUrl}>{t("notificationEmail.turnOff")}</Link>
      </Text>
    </>
  )
}
