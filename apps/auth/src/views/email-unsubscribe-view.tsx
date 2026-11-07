import { siteUrl } from "@repo/sites"
import { AuthLayout } from "@/components/auth-layout"
import {
  EmailUnsubscribeForm,
  EmailUnsubscribeInvalid,
  EmailUnsubscribeUnavailable,
} from "@/components/email-unsubscribe-form"
import type { UnsubscribeLink } from "@/lib/unsubscribe"

/**
 * The account Notifications page's URL, computed server-side: `siteUrl` reads `process.env`,
 * which is not inlined into the browser bundle (see `emailRevertSecurityUrl`).
 */
export function notificationSettingsUrl(): string {
  return `${siteUrl("account")}/notifications`
}

/**
 * `/email/unsubscribe`: the type the link turns off, named in a sentence, and the button — or,
 * for a link `peek` did not recognise, only a neutral note; when the api could not answer, a
 * try-again note instead (an outage is never presented as a dead link).
 */
export function EmailUnsubscribeView({ token, link }: { token: string; link: UnsubscribeLink }) {
  return (
    <AuthLayout>
      {link.status === "valid" ? (
        <EmailUnsubscribeForm
          token={token}
          type={link.type}
          settingsUrl={notificationSettingsUrl()}
        />
      ) : link.status === "unavailable" ? (
        <EmailUnsubscribeUnavailable />
      ) : (
        <EmailUnsubscribeInvalid />
      )}
    </AuthLayout>
  )
}
