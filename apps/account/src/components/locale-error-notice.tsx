"use client"

import { Alert, AlertDescription } from "@repo/ui/components/alert"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { LOCALE_ERROR_PARAM } from "@/lib/locale"

/**
 * Says the language could not be saved, after the switcher's action came back with
 * `?locale_error=1`. Read from the URL in the browser: after a server action's redirect the layout
 * renders with the posting request's headers, which do not carry the new query.
 */
export function LocaleErrorNotice() {
  const failed = useSearchParams().get(LOCALE_ERROR_PARAM) === "1"
  const t = useTranslations("account.locale")
  if (!failed) return null
  return (
    <div className="container py-2">
      <Alert variant="destructive" role="alert">
        <AlertDescription>{t("error")}</AlertDescription>
      </Alert>
    </div>
  )
}
