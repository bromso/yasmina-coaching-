import type {
  BookingAudience,
  BookingDayPart,
  BookingLocation,
} from "@repo/api-contract/booking-limits"
import type { Locale } from "@repo/i18n/locales"
import { CONTACT_HREF } from "@/content/contact-links"
import type { BookingFlow } from "@/lib/booking-flow"
import type { PaymentMethod } from "@/lib/mock-payment"

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
  /**
   * Each journey's steps (`flowFor` in `src/lib/booking-flow.ts`); the last is always `/book/done`.
   * Each label is also its step's heading in the booking card.
   */
  steps: Record<BookingFlow, readonly string[]>
  /** The step indicator's accessible name, "Step 1 of 4". */
  stepOf: (n: number, total: number) => string
  stepper: {
    back: string
    /** Read after a finished step's name: "Step 1 of 4: Pick a time, done". */
    done: string
  }
  /** The browser-side checks before the next step; the server checks everything again. */
  check: {
    name: string
    email: string
    organisation: string
    eventIds: string
    message: string
    date: string
    method: string
  }
  payment: {
    summary: {
      heading: string
      offering: string
      when: string
      location: string
      bookedAs: string
      price: string
      vatIncluded: string
      vatAdded: string
      total: string
      perMonth: string
      vat: Record<BookingAudience, string>
      unpriced: string
    }
    methodsLegend: string
    methods: Record<PaymentMethod, { label: string; hint: string }>
    testMode: string
    pay: (amount: string) => string
    payWith: (amount: string, brand: string) => string
    /** The mock wallet sheet while it "waits" for the visitor's approval. */
    approve: string
    swish: { numberLabel: string; numberHint: string; invalid: string; open: string }
    approved: string
    /** Under the action's error when the mock had approved: the visitor must know they kept their money. */
    nothingCharged: string
    loading: string
    cancel: string
    cancelled: string
    invoice: {
      /** Where the invoice goes and when: a fixed price is invoiced at once, a quoted one later. */
      private: { priced: (email: string) => string; unpriced: (email: string) => string }
      organisation: { priced: string; unpriced: string }
      orgNumber: string
      orgNumberHint: string
      orgNumberInvalid: string
      reference: string
      referenceMissing: string
      address: string
      addressMissing: string
      confirm: string
    }
    submitting: string
  }
  /**
   * The labelled block the server action adds to the booking's notes, so Yasmina's mail says how
   * the visitor chose to pay and, for an organisation's invoice, where to send it.
   */
  billing: {
    heading: string
    method: string
    methods: Record<PaymentMethod, string>
    orgNumber: string
    reference: string
    address: string
    tooLong: string
  }
  review: {
    request: string
    dates: string
    location: string
    attendees: string
    venue: string
    contact: string
    notGiven: string
    note: string
    toReview: string
  }
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
    toPayment: string
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
    continueLabel: string
    submit: string
    submitting: string
    noScript: string
  }
  request: {
    intro: string
    continueLabel: string
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
  steps: {
    instant: ["Välj tid", "Dina uppgifter", "Betalning", "Klart"],
    group: ["Välj träff", "Dina uppgifter", "Betalning", "Klart"],
    request: ["Ditt önskemål", "Dina uppgifter", "Granska och skicka", "Klart"],
    member: ["Välj tid", "Dina uppgifter", "Klart"],
  },
  stepOf: (n, total) => `Steg ${n} av ${total}`,
  stepper: { back: "Tillbaka", done: "klart" },
  check: {
    name: "Fyll i ditt namn.",
    email: "Fyll i en giltig e-postadress.",
    organisation: "Fyll i organisationens namn.",
    eventIds: "Välj minst ett datum.",
    message: "Berätta kort vad du vill uppnå.",
    date: "Välj minst ett datum, från och med i morgon.",
    method: "Välj hur du vill betala.",
  },
  payment: {
    summary: {
      heading: "Din bokning",
      offering: "Tjänst",
      when: "Tid",
      location: "Plats",
      bookedAs: "Bokar som",
      price: "Pris",
      vatIncluded: "Varav moms 25 %",
      vatAdded: "Moms 25 %",
      total: "Att betala",
      perMonth: "per person och månad",
      vat: { private: "inkl. moms", organisation: "exkl. moms" },
      unpriced: "Bekräftas skriftligt",
    },
    methodsLegend: "Välj hur du vill betala",
    methods: {
      apple_pay: { label: "Apple Pay", hint: "Med Face ID eller Touch ID på din enhet." },
      google_pay: { label: "Google Pay", hint: "Med kortet som är sparat i ditt Google-konto." },
      swish: { label: "Swish", hint: "Godkänn i Swish-appen på din telefon." },
      invoice: { label: "Faktura", hint: "Betala i efterhand." },
    },
    testMode: "Testläge: ingen betalning dras.",
    pay: (amount) => `Betala ${amount}`,
    payWith: (amount, brand) => `Betala ${amount} med ${brand}`,
    approve: "Godkänn betalningen på din enhet…",
    swish: {
      numberLabel: "Mobilnummer för Swish",
      numberHint: "Till exempel 070 123 45 67.",
      invalid: "Fyll i ett svenskt mobilnummer, till exempel 070 123 45 67.",
      open: "Öppna Swish-appen och godkänn betalningen…",
    },
    approved: "Betalningen är godkänd. Bokningen skickas…",
    nothingCharged: "Ingen betalning har dragits.",
    loading: "Hämtar betalningen…",
    cancel: "Avbryt",
    cancelled: "Betalningen avbröts. Inget har dragits.",
    invoice: {
      private: {
        priced: (email) =>
          `Fakturan skickas till ${email} när bokningen är klar, med 30 dagars betalningstid. Inget personnummer behövs.`,
        unpriced: (email) =>
          `Fakturan skickas till ${email} när Yasmina har bekräftat priset, med 30 dagars betalningstid. Inget personnummer behövs.`,
      },
      organisation: {
        priced:
          "Fakturan skickas dit du anger nedan när bokningen är klar, med 30 dagars betalningstid.",
        unpriced:
          "Fakturan skickas dit du anger nedan när Yasmina har bekräftat priset, med 30 dagars betalningstid.",
      },
      orgNumber: "Organisationsnummer",
      orgNumberHint: "Tio siffror, till exempel 212000-1355.",
      orgNumberInvalid: "Fyll i ett giltigt organisationsnummer.",
      reference: "Fakturareferens",
      referenceMissing: "Fyll i er fakturareferens.",
      address: "E-post eller postadress för fakturan",
      addressMissing: "Fyll i vart fakturan ska skickas.",
      confirm: "Boka och betala mot faktura",
    },
    submitting: "Bokar…",
  },
  billing: {
    heading: "[Betalning]",
    method: "Betalsätt",
    methods: {
      apple_pay: "Apple Pay (testläge)",
      google_pay: "Google Pay (testläge)",
      swish: "Swish (testläge)",
      invoice: "Faktura",
    },
    orgNumber: "Organisationsnummer",
    reference: "Fakturareferens",
    address: "Fakturan skickas till",
    tooLong: "Fakturauppgifterna är för långa. Korta ned dem och försök igen.",
  },
  review: {
    request: "Vad du vill uppnå",
    dates: "Önskade datum",
    location: "Var",
    attendees: "Antal deltagare",
    venue: "Lokal",
    contact: "Kontakt",
    notGiven: "Inte angivet",
    note: "Ingen betalning nu: du får en offert, och betalar mot faktura efter bekräftelse.",
    toReview: "Granska förfrågan",
  },
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
  noScriptLink: { label: "Be om ett introsamtal", href: CONTACT_HREF },
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
    toPayment: "Fortsätt till betalning",
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
    continueLabel: "Vidare till dina uppgifter",
    submit: "Boka platser",
    submitting: "Bokar…",
    noScript:
      "Listan med datum kräver JavaScript. Om du hellre låter bli att slå på det kan du be om ett introsamtal, så reserverar Yasmina en plats åt dig.",
  },
  request: {
    intro:
      "Berätta för Yasmina vad du har i tankarna och när. Hon svarar inom några dagar med ett förslag på tid och en skriftlig offert.",
    continueLabel: "Vidare till dina uppgifter",
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
  steps: {
    instant: ["Pick a time", "Your details", "Payment", "Done"],
    group: ["Pick a session", "Your details", "Payment", "Done"],
    request: ["Your request", "Your details", "Review and send", "Done"],
    member: ["Pick a time", "Your details", "Done"],
  },
  stepOf: (n, total) => `Step ${n} of ${total}`,
  stepper: { back: "Back", done: "done" },
  check: {
    name: "Enter your name.",
    email: "Enter a valid email address.",
    organisation: "Enter the organisation's name.",
    eventIds: "Pick at least one date.",
    message: "Tell Yasmina briefly what you want to achieve.",
    date: "Pick at least one date, from tomorrow onwards.",
    method: "Choose how you want to pay.",
  },
  payment: {
    summary: {
      heading: "Your booking",
      offering: "Service",
      when: "Time",
      location: "Where",
      bookedAs: "Booking as",
      price: "Price",
      vatIncluded: "Of which VAT 25%",
      vatAdded: "VAT 25%",
      total: "To pay",
      perMonth: "per person a month",
      vat: { private: "incl. VAT", organisation: "excl. VAT" },
      unpriced: "Confirmed in writing",
    },
    methodsLegend: "Choose how to pay",
    methods: {
      apple_pay: { label: "Apple Pay", hint: "With Face ID or Touch ID on your device." },
      google_pay: { label: "Google Pay", hint: "With the card saved in your Google account." },
      swish: { label: "Swish", hint: "Approve in the Swish app on your phone." },
      invoice: { label: "Invoice", hint: "Pay afterwards." },
    },
    testMode: "Test mode: no payment is taken.",
    pay: (amount) => `Pay ${amount}`,
    payWith: (amount, brand) => `Pay ${amount} with ${brand}`,
    approve: "Approve the payment on your device…",
    swish: {
      numberLabel: "Mobile number for Swish",
      numberHint: "For example 070 123 45 67.",
      invalid: "Enter a Swedish mobile number, for example 070 123 45 67.",
      open: "Open the Swish app and approve the payment…",
    },
    approved: "Payment approved. Sending the booking…",
    nothingCharged: "Nothing has been charged.",
    loading: "Loading payment…",
    cancel: "Cancel",
    cancelled: "The payment was cancelled. Nothing was charged.",
    invoice: {
      private: {
        priced: (email) =>
          `The invoice is sent to ${email} once the booking is made, with 30 days to pay. No personal identity number is needed.`,
        unpriced: (email) =>
          `The invoice is sent to ${email} once Yasmina has confirmed the price, with 30 days to pay. No personal identity number is needed.`,
      },
      organisation: {
        priced:
          "The invoice goes where you say below once the booking is made, with 30 days to pay.",
        unpriced:
          "The invoice goes where you say below once Yasmina has confirmed the price, with 30 days to pay.",
      },
      orgNumber: "Organisation number",
      orgNumberHint: "Ten digits, for example 212000-1355.",
      orgNumberInvalid: "Enter a valid Swedish organisation number.",
      reference: "Invoice reference",
      referenceMissing: "Enter your invoice reference.",
      address: "Email or postal address for the invoice",
      addressMissing: "Enter where the invoice should go.",
      confirm: "Book and pay by invoice",
    },
    submitting: "Booking…",
  },
  billing: {
    heading: "[Payment]",
    method: "Payment method",
    methods: {
      apple_pay: "Apple Pay (test mode)",
      google_pay: "Google Pay (test mode)",
      swish: "Swish (test mode)",
      invoice: "Invoice",
    },
    orgNumber: "Organisation number",
    reference: "Invoice reference",
    address: "Send the invoice to",
    tooLong: "The invoice details are too long. Shorten them and try again.",
  },
  review: {
    request: "What you want to achieve",
    dates: "Preferred dates",
    location: "Where",
    attendees: "Attendees",
    venue: "Venue",
    contact: "Contact",
    notGiven: "Not given",
    note: "No payment now: you get a quote, and pay by invoice after confirmation.",
    toReview: "Review request",
  },
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
  noScriptLink: { label: "Request an intro call", href: CONTACT_HREF },
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
    toPayment: "Continue to payment",
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
    continueLabel: "Continue to your details",
    submit: "Reserve seats",
    submitting: "Booking…",
    noScript:
      "The list of dates needs JavaScript. If you would rather not turn it on, request an intro call and Yasmina will reserve a seat for you.",
  },
  request: {
    intro:
      "Tell Yasmina what you have in mind and when. She replies within a few days with a suggested time and a written quote.",
    continueLabel: "Continue to your details",
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
