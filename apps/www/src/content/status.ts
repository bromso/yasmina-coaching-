import type { Locale } from "@repo/i18n/locales"

/**
 * The status pages' words, in Swedish and English. Client-safe and tiny on purpose: `error.tsx`
 * is a client component and imports it whole (it reads the page's language from
 * `<html lang>`); `not-found.tsx` picks one language on the server.
 */
export type StatusCopy = {
  notFound: { title: string; description: string }
  error: { title: string; description: string; reference: string; retry: string }
  home: string
}

export const STATUS: Record<Locale, StatusCopy> = {
  sv: {
    notFound: {
      title: "Sidan finns inte",
      description: "Sidan du letar efter finns inte eller har flyttats.",
    },
    error: {
      title: "Något gick fel",
      description: "Ett oväntat fel inträffade. Försök igen, eller gå tillbaka till startsidan.",
      reference: "Referens:",
      retry: "Försök igen",
    },
    home: "Till startsidan",
  },
  en: {
    notFound: {
      title: "Page not found",
      description: "The page you are looking for does not exist or has moved.",
    },
    error: {
      title: "Something went wrong",
      description: "An unexpected error occurred. Try again, or go back to the home page.",
      reference: "Reference:",
      retry: "Try again",
    },
    home: "To the home page",
  },
}
