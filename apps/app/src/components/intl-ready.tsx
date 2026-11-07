"use client"

import { createContext, type ReactNode, useContext } from "react"

const IntlReadyContext = createContext(false)

/**
 * Marks the tree under the root layout's `NextIntlClientProvider`. `error.tsx` is also rendered by
 * `global-error.tsx`, outside the layout and so outside the provider, where `useTranslations` would
 * throw; it asks this first and falls back to English there.
 */
export function IntlReady({ children }: { children: ReactNode }) {
  return <IntlReadyContext value={true}>{children}</IntlReadyContext>
}

export const useIntlReady = () => useContext(IntlReadyContext)
