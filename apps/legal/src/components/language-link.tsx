"use client"

import { localeCookie } from "@repo/i18n/cookie"
import type { Locale } from "@repo/i18n/locales"
import type { ReactNode } from "react"

export type LanguageLinkProps = {
  href: string
  /** The language the link leads to: written to the shared `locale` cookie on click. */
  locale: Locale
  /** The cookie's `Domain`, from the server (`cookieDomain`), so www and the other apps read it. */
  domain?: string
  /** The accessible name, in the target language. */
  name: string
  className?: string
  children: ReactNode
}

/**
 * The header's link to the page in the other language. A plain link (it works without
 * JavaScript); on click it first saves the reader's choice in the shared `locale` cookie, so
 * www, where the header's brand leads, opens in the same language.
 */
export function LanguageLink({
  href,
  locale,
  domain,
  name,
  className,
  children,
}: LanguageLinkProps) {
  return (
    <a
      href={href}
      hrefLang={locale}
      lang={locale}
      aria-label={name}
      className={className}
      onClick={() => {
        document.cookie = localeCookie(locale, {
          domain,
          secure: window.location.protocol === "https:",
        })
      }}
    >
      {children}
    </a>
  )
}
