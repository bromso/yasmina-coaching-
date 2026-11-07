"use client"

import { Alert, AlertDescription } from "@repo/ui/components/alert"
import { useTranslations } from "next-intl"

/**
 * The api's "sign in again" refusal (a session past the re-authentication window), with a link to
 * the auth app's sign-in form (`href`, built by the page action) in place of the plain message.
 */
export function ReauthNotice({ message, href }: { message?: string; href: string }) {
  const t = useTranslations("account.twoFactor")
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>
        {message}{" "}
        <a href={href} className="underline underline-offset-4">
          {t("signInAgain")}
        </a>
      </AlertDescription>
    </Alert>
  )
}
