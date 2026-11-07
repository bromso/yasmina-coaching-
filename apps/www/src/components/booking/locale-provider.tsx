"use client"

import type { Locale } from "@repo/i18n/locales"
import { createContext, type ReactNode, useContext } from "react"
import { BOOKING_FORMS, type BookingFormCopy } from "@/content/booking-forms"
import { SITE_LOCALE } from "@/lib/site-locale"

const LocaleContext = createContext<Locale>(SITE_LOCALE)

/**
 * The page's language for the booking forms' client tree. The server view wraps a form in it with
 * the request's locale (`getLocale()`); the forms then read their words with `useBookingCopy()`
 * and format dates with `useLocale()`. A context rather than props because part of that copy is
 * functions (counts, numbered labels), which cannot cross from a server component.
 */
export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

/** The page's language; Swedish outside a provider. */
export const useLocale = (): Locale => useContext(LocaleContext)

/** The booking forms' words in the page's language. */
export const useBookingCopy = (): BookingFormCopy => BOOKING_FORMS[useLocale()]
