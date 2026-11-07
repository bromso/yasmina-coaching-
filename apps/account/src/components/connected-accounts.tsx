"use client"

import type { Identity, ProviderId } from "@repo/api-contract"
import { formatUtcDate } from "@repo/i18n/dates"
import type { Locale } from "@repo/i18n/locales"
import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { disconnectIdentity } from "@/app/(account)/security/actions"
import type { FormState } from "@/lib/actions"
import { PROVIDER_LABELS } from "@/lib/providers"

/**
 * One row per configured provider: connected shows its linked email and a Disconnect form,
 * unconnected a Connect link to the auth app's `/oauth/<p>/start` with this page as `next`. The
 * `authUrl`/`securityUrl` are computed server-side (`siteUrl` reads `process.env`, which is not
 * inlined into the browser bundle) and passed down as plain strings.
 */
export function ConnectedAccounts({
  providers,
  identities,
  hasPassword,
  hasPasskeys,
  authUrl,
  securityUrl,
  connectError,
  locale,
}: {
  providers: ProviderId[]
  identities: Identity[]
  hasPassword: boolean
  /** Any passkey also signs in, so the last provider can go once one exists. */
  hasPasskeys: boolean
  authUrl: string
  securityUrl: string
  /** A failed connect the auth app redirected back with; replaced by the next disconnect result. */
  connectError?: string
  /** The page's language for the dates, printed in UTC so server and hydration agree. */
  locale: Locale
}) {
  const t = useTranslations("account.connected")
  const [state, action, pending] = useActionState(disconnectIdentity, { ok: false } as FormState)

  if (providers.length === 0) {
    return <p className="text-muted-foreground px-6 py-4 text-sm">{t("none")}</p>
  }

  const shown: FormState =
    !state.message && connectError ? { ok: false, message: connectError } : state

  // The last identity is the only way in until a password or a passkey exists: disable
  // disconnecting it (the api's own rule, `account.identities.disconnect`).
  const onlySignIn = !hasPassword && !hasPasskeys && identities.length === 1

  return (
    <>
      {/* Always mounted, so the live region inside it exists before a message arrives. */}
      <div className={shown.message ? "grid gap-2 px-6 py-4" : undefined}>
        <FormMessage state={shown} />
      </div>
      <ul className="flex flex-col divide-y">
        {providers.map((p) => {
          const identity = identities.find((i) => i.provider === p)
          const label = PROVIDER_LABELS[p]

          if (!identity) {
            const href = `${authUrl}/oauth/${p}/start?next=${encodeURIComponent(securityUrl)}`
            return (
              <li key={p} className="flex items-center justify-between gap-4 px-6 py-3 text-sm">
                <span className="font-medium">{label}</span>
                <Button asChild variant="outline" size="sm">
                  <a href={href}>{t("connect")}</a>
                </Button>
              </li>
            )
          }

          const disabled = pending || onlySignIn
          const hintId = `disconnect-${p}-hint`
          return (
            <li
              key={p}
              className="flex flex-col gap-2 px-6 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-col">
                <span className="font-medium">{label}</span>
                <span className="text-muted-foreground text-xs">
                  {identity.email != null
                    ? t("connectedAt", {
                        email: identity.email,
                        date: formatUtcDate(identity.createdAt, locale),
                      })
                    : t("connectedNoEmail", { date: formatUtcDate(identity.createdAt, locale) })}
                </span>
                {onlySignIn && (
                  <span id={hintId} className="text-muted-foreground text-xs">
                    {t("onlySignIn")}
                  </span>
                )}
              </div>
              <form action={action}>
                <input type="hidden" name="provider" value={p} />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={disabled}
                  aria-disabled={disabled}
                  aria-describedby={onlySignIn ? hintId : undefined}
                >
                  {t("disconnect")}
                </Button>
              </form>
            </li>
          )
        })}
      </ul>
    </>
  )
}
