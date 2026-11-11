"use client"

import { localeCookie, parseLocaleCookie } from "@repo/i18n/cookie"
import { DEFAULT_LOCALE, isLocale, type Locale } from "@repo/i18n/locales"
import { type LocaleOption, LocaleSwitcher } from "@repo/ui/components/locale-switcher"
import { cn } from "@repo/ui/lib/utils"
import { type ReactElement, useEffect, useState, useSyncExternalStore } from "react"

export type StaticLocaleSwitcherProps = {
  /** A fallback used only until the cookie is read client-side; `en` when this is unset too. */
  current?: string
  /** Passed to the cookie's `Domain` attribute, as `CookieConsent` already gets for the same app. */
  domain?: string
  /** Every locale, each labelled in its own language (`LOCALE_NAMES` from `@repo/i18n`). */
  options: LocaleOption[]
  /** Prefixes the menu trigger's accessible name. English: the static apps' copy stays English. */
  label?: string
  /** Shown in a polite live region once the pick is saved. */
  savedNote?: string
  /**
   * Reload the page after writing the cookie, for an app whose server renders each request in the
   * cookie's language (www): the visitor sees the page switch at once, so no saved note shows.
   * Off by default: the other static apps keep their page and show `savedNote`.
   */
  reloadOnChange?: boolean
  className?: string
}

const subscribeNever = () => () => {}

/**
 * The side effect, pure and separate from the component so a test can assert the exact string
 * written, without touching `document`. Mirrors `cookie-consent.tsx`'s
 * `document.cookie = consentCookie(...)`.
 */
export function writeLocaleCookie(
  locale: Locale,
  options: { domain?: string; secure: boolean },
  write: (cookie: string) => void = (cookie) => {
    document.cookie = cookie
  }
): void {
  write(localeCookie(locale, options))
}

/**
 * What choosing a language in the menu does, pure and separate from the component so a test can drive it
 * without a browser: write the cookie, then either reload (`reloadOnChange`) or report that the
 * note should show. Returns whether the saved note is due.
 */
export function chooseLocale(
  locale: Locale,
  options: { domain?: string; secure: boolean; reloadOnChange?: boolean },
  effects: { write?: (cookie: string) => void; reload: () => void }
): boolean {
  writeLocaleCookie(locale, options, effects.write)
  if (options.reloadOnChange) {
    effects.reload()
    return false
  }
  return true
}

/**
 * The static apps' header switcher: `LocaleSwitcher`'s language menu, applied as soon as a
 * language is chosen. There is no form to fall back to (a static app has no per-request server
 * render to post to), so it stays unusable until hydrated — the
 * `useSyncExternalStore(subscribeNever, () => true, () => false)` probe `danger-zone.tsx` uses —
 * and writes the `locale` cookie itself when a language is chosen, the only persistence a static
 * page can offer. Before hydration it renders the same trigger as an invisible placeholder
 * (`visibility: hidden`, `aria-hidden`, `inert`: out of the accessibility tree, never focusable)
 * so the header's row keeps its width and nothing shifts when the real switcher appears.
 * Switching does not re-render the current (still English, still static) page: `savedNote` says
 * so rather than staying silent, until the page is reloaded. An app that renders per request in
 * the cookie's language passes `reloadOnChange` instead, and the page reloads in the new language.
 */
export function StaticLocaleSwitcher({
  current,
  domain,
  options,
  label,
  savedNote = "Saved — signed-in pages will use it.",
  reloadOnChange = false,
  className,
}: StaticLocaleSwitcherProps): ReactElement {
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  )
  const [value, setValue] = useState<Locale>(isLocale(current) ? current : DEFAULT_LOCALE)
  const [saved, setSaved] = useState(false)

  // Read once mounted (post-hydration): a static page knows nothing about the visitor's cookie
  // at build time, so there is nothing safe to read before this effect runs client-side.
  useEffect(() => {
    const cookieLocale = parseLocaleCookie(document.cookie)
    if (cookieLocale) setValue(cookieLocale)
  }, [])

  if (!hydrated) {
    return (
      <div aria-hidden="true" inert className={cn("invisible flex items-center gap-2", className)}>
        <LocaleSwitcher current={value} options={options} label={label} />
      </div>
    )
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LocaleSwitcher
        current={value}
        options={options}
        label={label}
        onChange={(locale) => {
          if (!isLocale(locale)) return
          const note = chooseLocale(
            locale,
            { domain, secure: location.protocol === "https:", reloadOnChange },
            { reload: () => window.location.reload() }
          )
          setValue(locale)
          setSaved(note)
        }}
      />
      <div role="status" aria-live="polite" className="text-muted-foreground text-xs">
        {saved ? savedNote : null}
      </div>
    </div>
  )
}
