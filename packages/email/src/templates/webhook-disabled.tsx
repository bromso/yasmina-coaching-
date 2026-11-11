import { Button, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, EmailHeading, EmailLink, greeting, Layout } from "./layout"

export type WebhookDisabledProps = {
  name?: string
  workspaceName: string
  /** The endpoint URL's host (with a non-default port) — never its path or query, which may
   * carry a token of the receiver's. */
  host: string
  /** `failures`: `failures` dead deliveries in a row. `gone`: the endpoint answered 410 Gone. */
  reason: "failures" | "gone"
  /** How many dead deliveries in a row turned it off (shown for `failures`). */
  failures: number
  /** The workspace settings page, where the endpoint can be fixed and turned back on. */
  link: string
  brand?: string
  locale?: Locale
}

export const webhookDisabledSubject = "A webhook endpoint was turned off"

/**
 * Sent by `webhook.deliver` to every owner of the workspace when it turns an endpoint off on its
 * own (never for an admin's own `manual` disable). Says which host and why, and that events from
 * while it is off are not resent.
 */
export function WebhookDisabled({
  name,
  workspaceName,
  host,
  reason,
  failures,
  link,
  brand,
  locale = DEFAULT_LOCALE,
}: WebhookDisabledProps) {
  const t = translatorFor(locale, "email")
  const values = { host, workspace: workspaceName, count: failures }
  return (
    <Layout preview={t("webhookDisabled.preview", { host })} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("webhookDisabled.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>
        {reason === "gone"
          ? t("webhookDisabled.bodyGone", values)
          : t("webhookDisabled.bodyFailures", values)}
      </Text>
      <Text>{t("webhookDisabled.action")}</Text>
      <Button href={link} style={button}>
        {t("webhookDisabled.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <EmailLink href={link}>{link}</EmailLink>
      </Text>
    </Layout>
  )
}
