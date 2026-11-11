import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { BRAND_NAME } from "@repo/sites/brand"
import type { ComponentProps, ReactNode } from "react"
import { EMAIL_COLORS, EMAIL_FONTS } from "../tokens.generated"

export const BRAND = BRAND_NAME

const body = { backgroundColor: EMAIL_COLORS.muted, fontFamily: EMAIL_FONTS.body }
const card = {
  backgroundColor: EMAIL_COLORS.background,
  color: EMAIL_COLORS.foreground,
  border: `1px solid ${EMAIL_COLORS.border}`,
  borderRadius: 8,
  margin: "24px auto",
  padding: 24,
  maxWidth: 480,
}
const footer = { color: EMAIL_COLORS.mutedForeground, fontSize: 12 }

/** The call-to-action button style every mail shares. */
export const button = {
  background: EMAIL_COLORS.primary,
  color: EMAIL_COLORS.primaryForeground,
  padding: "10px 16px",
  borderRadius: 6,
}

/**
 * A link in the brand blue, set inline: React Email's own `Link` writes its own blue, below 4.5:1 on
 * the card, and clients that strip a `<head>` style would show it.
 */
export function EmailLink({ style, ...props }: ComponentProps<typeof Link>) {
  return <Link {...props} style={{ color: EMAIL_COLORS.brandBlue, ...style }} />
}

/** A heading in the display serif, set inline so it survives clients that strip `<head>` styles. */
export function EmailHeading({ style, ...props }: ComponentProps<typeof Heading>) {
  return (
    <Heading
      {...props}
      style={{ fontFamily: EMAIL_FONTS.display, color: EMAIL_COLORS.foreground, ...style }}
    />
  )
}

/** Every text-on-background pair the shell draws: the test holds each to 4.5:1. */
export const PAIRS = [
  { name: "body text on card", fg: EMAIL_COLORS.foreground, bg: EMAIL_COLORS.background },
  { name: "link on card", fg: EMAIL_COLORS.brandBlue, bg: EMAIL_COLORS.background },
  { name: "footer on card", fg: EMAIL_COLORS.mutedForeground, bg: EMAIL_COLORS.background },
  { name: "button text on button", fg: EMAIL_COLORS.primaryForeground, bg: EMAIL_COLORS.primary },
] as const

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
