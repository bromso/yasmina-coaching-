import type { Locale } from "@repo/i18n/locales"
import { messagesFor } from "@repo/i18n/messages"
import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"

/** Server-renders `ui` as a page in `locale` would: inside the provider the root layout renders. */
export function renderIn(locale: Locale, ui: ReactNode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale, ["auth"])} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>
  )
}
