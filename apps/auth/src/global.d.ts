import type { Locale } from "@repo/i18n/locales"
import type { Messages } from "@repo/i18n/messages"

// next-intl's keys and locales are typed from @repo/i18n's English catalog: a misspelled key in
// `t("…")` is a type error, not a raw key on screen.
declare module "next-intl" {
  interface AppConfig {
    Locale: Locale
    Messages: Messages
  }
}
