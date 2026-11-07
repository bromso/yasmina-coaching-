"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"
import type * as React from "react"

/**
 * Canonical theme provider for every app — wraps next-themes with the
 * monorepo defaults. Use in each app's root layout (or providers file):
 *
 *   <ThemeProvider>{children}</ThemeProvider>
 */
export function ThemeProvider({
  children,
  attribute = "class",
  defaultTheme = "system",
  enableSystem = true,
  disableTransitionOnChange = true,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute={attribute}
      defaultTheme={defaultTheme}
      enableSystem={enableSystem}
      disableTransitionOnChange={disableTransitionOnChange}
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
