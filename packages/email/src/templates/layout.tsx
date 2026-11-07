import { Body, Container, Head, Html, Preview, Section, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { BRAND_NAME } from "@repo/sites/brand"
import type { ReactNode } from "react"

export const BRAND = BRAND_NAME

const body = { backgroundColor: "#f6f6f6", fontFamily: "ui-sans-serif, system-ui, sans-serif" }
const card = {
  backgroundColor: "#ffffff",
  borderRadius: 8,
  margin: "24px auto",
  padding: 24,
  maxWidth: 480,
}
const footer = { color: "#6b7280", fontSize: 12 }

/** The call-to-action button style every mail shares. */
export const button = {
  background: "#111827",
  color: "#fff",
  padding: "10px 16px",
  borderRadius: 6,
}

/** The shell every mail shares: preview line, white card, brand footer. */
export function Layout({
  preview,
  brand = BRAND,
  locale = DEFAULT_LOCALE,
  children,
}: {
  preview: string
  brand?: string
  locale?: Locale
  children: ReactNode
}) {
  const t = translatorFor(locale, "email")
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={body}>
        <Container style={card}>
          <Section>{children}</Section>
          <Text style={footer}>
            {brand}
            {t("layout.footerSuffix")}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

/** What `translatorFor(locale, "email")` returns — every template takes one of these. */
export type Translator = (key: string, values?: Record<string, string | number | Date>) => string

export const greeting = (t: Translator, name?: string) =>
  name ? t("layout.greeting.withName", { name }) : t("layout.greeting.default")
