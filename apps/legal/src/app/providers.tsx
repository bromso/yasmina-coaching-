"use client"

import { ThemeProvider } from "@repo/ui/components/theme-provider"
import type React from "react"

interface Props {
  children: React.ReactNode
}

export function Providers({ children }: Props) {
  return <ThemeProvider>{children}</ThemeProvider>
}
