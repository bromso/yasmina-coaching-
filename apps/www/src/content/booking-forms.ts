import type {
  BookingAudience,
  BookingDayPart,
  BookingLocation,
} from "@repo/api-contract/booking-limits"
import type { Locale } from "@repo/i18n/locales"

/**
 * The words the booking forms say (the client components under `src/components/booking/`), in
 * Swedish and English. Client-safe — types only from the contract, nothing from `@repo/sites` —
 * because the forms read it in the browser through `useBookingCopy()` (`locale-provider.tsx`):
 * a few of these are functions (counts, numbered labels), which cannot travel as props from a
 * server component. Everything else on the booking pages lives in `src/content/booking.tsx`,
 * which re-exports this per locale as `bookingFor(locale).form`.
 */

export type BookingFormCopy = {
  audienceLabels: Record<BookingAudience, string>
  audienceHints: Record<BookingAudience, string>
  locationLabels: Record<BookingLocation, string>
  dayPartLabels: Record<BookingDayPart, string>
  /** The three steps of an instant booking; `/book/done` is the third. */
  steps: readonly [string, string, string]
  /** The step indicator's accessible name, "Step 1 of 3". */
  stepOf: (n: number, total: number) => string
  fields: {
    name: string
    email: string
    organisation: string
    organisationOptional: string
    phoneOptional: string
  }
  /** The shared notes field and the details form around it. */
  details: {
    audienceLegend: string
    locationLegend: string
    notesLabel: string
  }
  timezoneNote: string
  /**
   * The calendar's own words (react-day-picker defaults to US English): the month buttons' names
   * and the prefixes of a day's name. Month and weekday names come from `Intl` in the page's locale.
   */
  calendar: { previous: string; next: string; today: string; selected: string }
  noScriptLink: { label: string; href: string }
  retry: string
  instant: {
    noScript: string
    loading: string
    loadFailed: string
    noSlotsThisMonth: string
    pickDay: string
    noSlotsThisDay: string
    packageHint: (sessions: number) => string
    packageExtraNote: string
    selectedHeading: string
    /** "2 of 6" beside the heading when a programme takes several slots. */
    pickedCount: (picked: number, max: number) => string
    removeSlot: string
    continueLabel: string
    changeTimes: string
    submit: string
    submitting: string
    legal: string
  }
  group: {
    heading: string
    loading: string
    loadFailed: string
    none: string
    seatsLeft: (n: number) => string
    full: string
    seriesHint: string
    submit: string
    submitting: string
    noScript: string
  }
  request: {
    intro: string
    datesLegend: string
    datesHint: string
    dateLabel: (n: number) => string
    partLabel: (n: number) => string
    attendeesLabel: string
    venueLabel: string
    messageLabel: string
    messageHint: string
    submit: string
    submitting: string
    legal: string
  }
  cancel: {
    confirm: string
    submit: string
    cancelling: string
  }
}

const sv: BookingFormCopy = {
  audienceLabels: {
    private: "Privatperson",
    organisation: "Organisation",
  },
  audienceHints: {
    private: "Du betalar själv, eller tar fakturan till din arbetsgivare senare.",
    organisation: "Bokas och faktureras av en kommun, region, skola eller ett företag.",
  },
  locationLabels: {
    varberg: "På plats i Varberg",
    video: "Videosamtal",
    on_site: "På din arbetsplats",
  },
  dayPartLabels: {
    morning: "Förmiddag",
    afternoon: "Eftermiddag",
    full_day: "Heldag",
  },
  steps: ["Välj tid", "Dina uppgifter", "Klart"],
  stepOf: (n, total) => `Steg ${n} av ${total}`,
  fields: {
    name: "Namn",
    email: "E-post",
    organisation: "Organisation",
    organisationOptional: "Organisation (valfritt)",
    phoneOptional: "Telefon (valfritt)",
  },
  details: {
    audienceLegend: "Bokar som",
    locationLegend: "Var",
    notesLabel: "Något Yasmina bör veta innan ni ses? (valfritt)",
  },
  timezoneNote: "Tiderna visas i svensk tid (Europe/Stockholm).",
  calendar: { previous: "Föregående månad", next: "Nästa månad", today: "I dag", selected: "Vald" },
  noScriptLink: { label: "Be om ett introsamtal", href: "/#contact" },
  retry: "Försök igen",
  instant: {
    noScript:
      "Kalendern kräver JavaScript. Om du hellre låter bli att slå på det kan du be om ett introsamtal, så hittar Yasmina en tid tillsammans med dig.",
    loading: "Hämtar lediga tider…",
    loadFailed: "De lediga tiderna kunde inte hämtas. Försök igen.",
    noSlotsThisMonth: "Inga lediga tider den här månaden. Prova nästa.",
    pickDay: "Välj en dag i kalendern för att se dess lediga tider.",
    noSlotsThisDay: "Inget ledigt den här dagen.",
    packageHint: (sessions) =>
      `Lägg in det första tillfället nu, och upp till ${sessions} om du redan vet dina datum. Resten kan du lägga in från din bokningslänk senare.`,
    packageExtraNote:
      "Du lägger till ett tillfälle i ett pågående program. Välj en tid; den läggs till i programmet i stället för att starta ett nytt.",
    selectedHeading: "Dina tider",
    pickedCount: (picked, max) => `${picked} av ${max}`,
    removeSlot: "Ta bort",
    continueLabel: "Vidare till dina uppgifter",
    changeTimes: "Ändra tider",
    submit: "Bekräfta bokningen",
    submitting: "Bokar…",
    legal:
      "En bekräftelse med en länk för att hantera bokningen skickas till din e-post. Dina uppgifter används bara för den här bokningen.",
  },
  group: {
    heading: "Kommande datum",
    loading: "Hämtar kommande datum…",
    loadFailed: "De kommande datumen kunde inte hämtas. Försök igen.",
    none: "Inga grupptillfällen är öppna för bokning just nu. Be om ett introsamtal så berättar Yasmina när nästa öppnar.",
    seatsLeft: (n) => (n === 1 ? "1 plats kvar" : `${n} platser kvar`),
    full: "Fullbokat",
    seriesHint: "Välj ett datum, eller flera i en serie.",
    submit: "Boka platser",
    submitting: "Bokar…",
    noScript:
      "Listan med datum kräver JavaScript. Om du hellre låter bli att slå på det kan du be om ett introsamtal, så reserverar Yasmina en plats åt dig.",
  },
  request: {
    intro:
      "Berätta för Yasmina vad du har i tankarna och när. Hon svarar inom några dagar med ett förslag på tid och en skriftlig offert.",
    datesLegend: "Önskade datum",
    datesHint: "Upp till tre. Välj den del av dagen som passar dig för vart och ett.",
    dateLabel: (n) => `Datum ${n}`,
    partLabel: (n) => `Del av dagen ${n}`,
    attendeesLabel: "Hur många deltar? (valfritt)",
    venueLabel: "Lokal eller adress (valfritt)",
    messageLabel: "Vad vill du uppnå?",
    messageHint: "Några meningar räcker: situationen, gruppen, vad som ska bli annorlunda.",
    submit: "Skicka förfrågan",
    submitting: "Skickar…",
    legal:
      "En bekräftelse med en länk till din förfrågan skickas till din e-post. Dina uppgifter används bara för den här förfrågan.",
  },
  cancel: {
    confirm: "Ja, avboka den här sessionen",
    submit: "Avboka",
    cancelling: "Avbokar…",
  },
}

const en: BookingFormCopy = {
  audienceLabels: {
    private: "Individual",
    organisation: "Organisation",
  },
  audienceHints: {
    private: "You pay yourself, or take the invoice to your employer later.",
    organisation: "Booked and invoiced by a municipality, region, school or company.",
  },
  locationLabels: {
    varberg: "In person in Varberg",
    video: "Video call",
    on_site: "At your workplace",
  },
  dayPartLabels: {
    morning: "Morning",
    afternoon: "Afternoon",
    full_day: "Full day",
  },
  steps: ["Pick a time", "Your details", "Done"],
  stepOf: (n, total) => `Step ${n} of ${total}`,
  fields: {
    name: "Name",
    email: "Email",
    organisation: "Organisation",
    organisationOptional: "Organisation (optional)",
    phoneOptional: "Phone (optional)",
  },
  details: {
    audienceLegend: "Booking as",
    locationLegend: "Where",
    notesLabel: "Anything Yasmina should know before you meet? (optional)",
  },
  timezoneNote: "Times are shown in Swedish time (Europe/Stockholm).",
  calendar: {
    previous: "Previous month",
    next: "Next month",
    today: "Today",
    selected: "Selected",
  },
  noScriptLink: { label: "Request an intro call", href: "/#contact" },
  retry: "Try again",
  instant: {
    noScript:
      "The calendar needs JavaScript. If you would rather not turn it on, request an intro call and Yasmina will find a time with you.",
    loading: "Fetching available times…",
    loadFailed: "The available times could not be loaded. Please try again.",
    noSlotsThisMonth: "No available times this month. Try the next one.",
    pickDay: "Pick a day in the calendar to see its available times.",
    noSlotsThisDay: "Nothing available on this day.",
    packageHint: (sessions) =>
      `Book the first session now, and up to ${sessions} if you already know your dates. You can add the rest from your booking link later.`,
    packageExtraNote:
      "You are adding a session to an ongoing programme. Pick a time; it is added to the programme rather than starting a new one.",
    selectedHeading: "Your times",
    pickedCount: (picked, max) => `${picked} of ${max}`,
    removeSlot: "Remove",
    continueLabel: "Continue to your details",
    changeTimes: "Change times",
    submit: "Confirm booking",
    submitting: "Booking…",
    legal:
      "A confirmation with a link to manage the booking is sent to your email. Your details are used only for this booking.",
  },
  group: {
    heading: "Upcoming dates",
    loading: "Fetching upcoming dates…",
    loadFailed: "The upcoming dates could not be loaded. Please try again.",
    none: "No group sessions are open for booking right now. Request an intro call and Yasmina will tell you when the next one opens.",
    seatsLeft: (n) => (n === 1 ? "1 seat left" : `${n} seats left`),
    full: "Fully booked",
    seriesHint: "Pick one date, or several in a series.",
    submit: "Reserve seats",
    submitting: "Booking…",
    noScript:
      "The list of dates needs JavaScript. If you would rather not turn it on, request an intro call and Yasmina will reserve a seat for you.",
  },
  request: {
    intro:
      "Tell Yasmina what you have in mind and when. She replies within a few days with a suggested time and a written quote.",
    datesLegend: "Preferred dates",
    datesHint: "Up to three. For each, pick the part of the day that suits you.",
    dateLabel: (n) => `Date ${n}`,
    partLabel: (n) => `Part of day ${n}`,
    attendeesLabel: "How many will take part? (optional)",
    venueLabel: "Venue or address (optional)",
    messageLabel: "What do you want to achieve?",
    messageHint: "A few sentences are enough: the situation, the group, what should be different.",
    submit: "Send request",
    submitting: "Sending…",
    legal:
      "A confirmation with a link to your request is sent to your email. Your details are used only for this request.",
  },
  cancel: {
    confirm: "Yes, cancel this session",
    submit: "Cancel session",
    cancelling: "Cancelling…",
  },
}

/** Both languages, one shape. */
export const BOOKING_FORMS: Record<Locale, BookingFormCopy> = { sv, en }
