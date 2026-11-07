import type { Locale } from "@repo/i18n/locales"
import { messagesFor } from "@repo/i18n/messages"
import { NextIntlClientProvider } from "next-intl"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"

/**
 * Server-renders `ui` as a page in `locale` would: inside the provider the root layout renders.
 * A server view that reads another namespace (`ui`, which the request config loads for server
 * components) names it in `namespaces`.
 */
export function renderIn(
  locale: Locale,
  ui: ReactNode,
  namespaces: Parameters<typeof messagesFor>[1] = ["account"]
): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={messagesFor(locale, namespaces)}
      timeZone="UTC"
    >
      {ui}
    </NextIntlClientProvider>
  )
}
