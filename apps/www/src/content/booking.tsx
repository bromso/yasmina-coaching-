import {
  type BookingStatus,
  MEMBER_OFFERING_KEYS,
  OFFERING_KEYS,
  OFFERINGS,
  type OfferingKey,
  type OfferingKind,
} from "@repo/api-contract/booking-limits"
import type { Locale } from "@repo/i18n/locales"
import { BOOKING_FORMS, type BookingFormCopy } from "@/content/booking-forms"

/**
 * Every word on the booking pages (`/book`, `/book/<offering>`, `/book/done`, `/book/manage/…`),
 * in Swedish and English, one shape (`BookingContent`); `bookingFor(locale)` picks one per
 * request. The catalog itself — kinds, durations, audiences, locations — is the api contract's
 * `OFFERINGS`; this file only says how each one reads to a visitor. What the client forms say
 * lives in `src/content/booking-forms.ts` (client-safe) and comes back here as `form`. Prices
 * are never written here: every offering is quoted in writing before the first session.
 */

export type OfferingCopy = {
  title: string
  description: string
  included: readonly string[]
}

/** The catalog's two headed groups: which offerings each lists. */
export type CatalogGroup = {
  id: "leadership" | "inner"
  title: string
  description: string
  keys: readonly OfferingKey[]
}

const isInner = (key: OfferingKey) => key.startsWith("inner_")
const memberKeys: readonly OfferingKey[] = MEMBER_OFFERING_KEYS
/** Leadership coaching: every offering outside Ledarskap inifrån. */
const LEADERSHIP_KEYS = OFFERING_KEYS.filter((key) => !isInner(key))
/** Ledarskap inifrån's start calls and group; members' sessions are never listed. */
const INNER_KEYS = OFFERING_KEYS.filter((key) => isInner(key) && !memberKeys.includes(key))

/** Minutes of one session of `key`, from the contract. */
const minutes = (key: OfferingKey) => OFFERINGS[key].durationMinutes

export type BookingContent = {
  /** The forms' copy (labels, steps, field names), shared with the client components. */
  form: BookingFormCopy
  /** Page titles for the metadata. */
  meta: { catalog: string; done: string; manage: string }
  priceNote: string
  statusLabels: Record<BookingStatus, string>
  /** One line on each catalog card explaining what happens when you click. */
  kindLines: Record<OfferingKind, string>
  kindExplained: Record<OfferingKind, string>
  /** What each card in the header's carousel says under its name. */
  navHints: { request: string; group: string; sessions: (n: number) => string }
  offerings: Record<OfferingKey, OfferingCopy>
  /** `/book` lists these groups under their own headings, in this order. */
  catalogGroups: CatalogGroup[]
  catalog: {
    eyebrow: string
    title: string
    description: string
    audienceLegend: string
    introCall: { lead: string; label: string; href: string }
  }
  offering: { back: string }
  done: {
    eyebrow: string
    booked: { title: string; body: string }
    requested: { title: string; body: string }
    reference: string
    manage: string
    manageHint: string
    next: string
    nextItems: { instant: string[]; request: string[] }
    home: string
  }
  manage: {
    eyebrow: string
    title: string
    bookedBy: string
    bookings: string
    empty: string
    packageProgress: (booked: number, total: number) => string
    bookAnother: string
    cancelRule: string
    cancelLegend: string
    cancelled: string
    notCancellable: string
    timeTbc: string
  }
}

const sv: BookingContent = {
  form: BOOKING_FORMS.sv,
  meta: { catalog: "Boka", done: "Bokad", manage: "Hantera din bokning" },
  priceNote: "Priset bekräftas skriftligt före det första tillfället.",
  statusLabels: {
    pending: "Väntar på bekräftelse",
    confirmed: "Bekräftad",
    declined: "Avböjd",
    cancelled: "Avbokad",
  },
  kindLines: {
    instant: "Välj en tid",
    group: "Boka en plats",
    request: "Föreslå datum",
  },
  kindExplained: {
    instant: "Välj en ledig tid i kalendern så bekräftas den direkt.",
    group: "Ta en plats vid ett av de datum Yasmina har lagt in.",
    request: "Föreslå några datum så bekräftar Yasmina ett av dem inom några dagar.",
  },
  navHints: {
    request: "Förfrågan",
    group: "Gruppträffar",
    sessions: (n) => `${n} samtal`,
  },
  offerings: {
    session: {
      title: "Coachingsamtal",
      description:
        "En timme om det beslut, det samtal eller den person som kostar dig nattsömn. Ett bra första steg om du vill prova coaching innan du bestämmer dig för ett program.",
      included: [
        "60 minuter, i Varberg eller på video",
        "En kort skriftlig sammanfattning efteråt",
      ],
    },
    package_6: {
      title: "Coachingprogram, 6 tillfällen",
      description:
        "Sex timmar under tre till fyra månader: ett eller två mål som syns i beteende, och en handling för varje vecka däremellan. Lägg in det första tillfället nu och resten när du är redo.",
      included: [
        "Sex tillfällen på 60 minuter, med tre till fyra veckors mellanrum",
        "Kontakt via e-post mellan tillfällena",
        "Avboka eller flytta ett tillfälle fram till 24 timmar före",
      ],
    },
    package_10: {
      title: "Coachingprogram, 10 tillfällen",
      description:
        "Tio timmar över en termin eller en omorganisation: tid nog att ändra en vana, inte bara sätta ord på den. Lägg in det första tillfället nu och resten från din bokningslänk.",
      included: [
        "Tio tillfällen på 60 minuter, med tre till fyra veckors mellanrum",
        "Kontakt via e-post mellan tillfällena",
        "En avstämning av målen halvvägs",
      ],
    },
    group: {
      title: "Gruppcoaching",
      description:
        "Två timmar med en liten grupp chefer som inte är dina kollegor. Strukturerat, konfidentiellt och förvånansvärt praktiskt: du tar med en situation, gruppen tänker tillsammans med dig.",
      included: ["120 minuter per tillfälle", "Högst åtta chefer", "I Varberg eller på video"],
    },
    workshop: {
      title: "Workshop eller teamdag",
      description:
        "En halv eller hel dag för en ledningsgrupp eller enhet som behöver fungera som ett team igen: före en omorganisation, under den, eller efter.",
      included: [
        "Halv eller hel dag på din arbetsplats, eller på video",
        "Ett förberedande samtal med chefen",
        "En skriftlig uppföljning med det gruppen kom överens om",
      ],
    },
    enterprise: {
      title: "Program för organisationer",
      description:
        "Coaching och handledning för flera chefer eller en hel förvaltning under en termin eller ett år, utformat efter din organisations situation.",
      included: [
        "Ett planeringsmöte innan något läggs in i kalendern",
        "Individuell coaching och grupptillfällen i kombination",
        "En skriftlig lägesrapport vid överenskomna tidpunkter",
      ],
    },
    keynote: {
      title: "Föreläsning",
      description:
        "Fyrtiofem till sextio minuter om förebyggande ledarskap, emotionell intelligens på jobbet eller att leda i förändring, för en ledningsdag eller en konferens.",
      included: [
        "45 till 60 minuter, frågor inräknade",
        "Anpassad till din publik i ett kort samtal",
      ],
    },
    inner_start_coaching: {
      title: "Startsamtal, transformativ coachning",
      description: `Första steget i transformativ coachning: ${minutes("inner_start_coaching")} minuter där ni sätter dina mål, skriver ned dem och gör en plan för uppföljning.`,
      included: [
        `${minutes("inner_start_coaching")} minuter, i Varberg eller på video`,
        "Dina mål nedskrivna, och en plan för uppföljning",
      ],
    },
    inner_start_mentoring: {
      title: "Startsamtal, mentorskap",
      description: `Första steget i mentorskapet: ${minutes("inner_start_mentoring")} minuter där ni sätter dina mål, skriver ned dem och gör en plan för uppföljning.`,
      included: [
        `${minutes("inner_start_mentoring")} minuter, i Varberg eller på video`,
        "Dina mål nedskrivna, och en plan för uppföljning",
      ],
    },
    inner_start_lifestyle: {
      title: "Startsamtal, livsstilsförändring",
      description: `Första steget i livsstilsförändringen: ${minutes("inner_start_lifestyle")} minuter där ni sätter dina mål och du får en personlig övningsplan.`,
      included: [
        `${minutes("inner_start_lifestyle")} minuter, i Varberg eller på video`,
        "En personlig övningsplan med andning, yin yoga, meditation och visualisering",
      ],
    },
    inner_session: {
      title: "Samtal för medlemmar",
      description:
        "Ditt löpande samtal i transformativ coachning eller livsstilsförändring, för dig som redan är med och har gjort ditt startsamtal.",
      included: [`${minutes("inner_session")} minuter, i Varberg eller på video`],
    },
    inner_mentoring_session: {
      title: "Mentorssamtal för medlemmar",
      description:
        "Ditt löpande samtal i mentorskapet, för dig som redan är med och har gjort ditt startsamtal.",
      included: [`${minutes("inner_mentoring_session")} minuter, i Varberg eller på video`],
    },
    inner_group: {
      title: "Inifrån-gruppen",
      description:
        "En träff i den löpande gruppen: ett tema ur yogans filosofi, en övning tillsammans och samtal om ledarskap och liv.",
      included: [`${minutes("inner_group")} minuter, i Varberg eller på video`],
    },
  },
  catalogGroups: [
    {
      id: "leadership",
      title: "Ledarskapscoaching",
      description: "Samtal, program och uppdrag för chefer, ledningsgrupper och organisationer.",
      keys: LEADERSHIP_KEYS,
    },
    {
      id: "inner",
      title: "Ledarskap inifrån",
      description:
        "Personlig utveckling med yogans filosofi som grund. De enskilda tjänsterna börjar med ett startsamtal, och i gruppen bokar du en plats per träff.",
      keys: INNER_KEYS,
    },
  ],
  catalog: {
    eyebrow: "Boka",
    title: "Välj hur du vill arbeta med Yasmina",
    description:
      "Samtal och program bokas direkt i kalendern. Workshoppar, program för en hel organisation och föreläsningar börjar med en förfrågan.",
    audienceLegend: "Jag bokar som",
    introCall: {
      lead: "Osäker på vilket?",
      label: "Be om ett kostnadsfritt introsamtal",
      href: "/#contact",
    },
  },
  offering: { back: "Alla sätt att boka" },
  done: {
    eyebrow: "Klart",
    booked: {
      title: "Du är bokad",
      body: "En bekräftelse är på väg till din e-post, med en länk för att hantera bokningen. Yasmina har läst dina anteckningar innan ni ses.",
    },
    requested: {
      title: "Förfrågan mottagen",
      body: "Yasmina svarar inom några dagar med ett förslag på tid och en skriftlig offert. Inget är bokat förrän du har sagt ja till båda.",
    },
    reference: "Din referens",
    manage: "Hantera din bokning",
    manageHint:
      "Samma länk finns i din bekräftelse via e-post, så du kan komma tillbaka till den senare.",
    next: "Vad händer nu",
    nextItems: {
      instant: [
        "En bekräftelse med tid och plats landar i din inkorg inom några minuter.",
        "Du kan avboka från din bokningslänk fram till 24 timmar före ett tillfälle.",
        "Yasmina skickar en kort förberedelse en dag eller två innan ni ses.",
      ],
      request: [
        "Yasmina läser din förfrågan och föreslår en tid, oftast inom några dagar.",
        "Du får en skriftlig offert tillsammans med förslaget.",
        "När du säger ja bekräftas bokningen via e-post.",
      ],
    },
    home: "Tillbaka till startsidan",
  },
  manage: {
    eyebrow: "Din bokning",
    title: "Hantera din bokning",
    bookedBy: "Bokad av",
    bookings: "Tillfällen",
    empty: "Inga tillfällen på den här bokningen än.",
    packageProgress: (booked, total) => `${booked} av ${total} tillfällen inlagda i kalendern.`,
    bookAnother: "Boka ett tillfälle till",
    cancelRule:
      "Ett bekräftat tillfälle kan avbokas här fram till 24 timmar innan det börjar. Närmare än så, svara på din bokningsbekräftelse i stället.",
    cancelLegend: "Avboka den här sessionen",
    cancelled: "Sessionen är avbokad.",
    notCancellable:
      "För nära inpå för att avboka online. Svara på din bokningsbekräftelse i stället.",
    timeTbc: "Tid bekräftas av Yasmina",
  },
}

const en: BookingContent = {
  form: BOOKING_FORMS.en,
  meta: { catalog: "Book", done: "Booked", manage: "Manage your booking" },
  priceNote: "The price is confirmed in writing before the first session.",
  statusLabels: {
    pending: "Awaiting confirmation",
    confirmed: "Confirmed",
    declined: "Declined",
    cancelled: "Cancelled",
  },
  kindLines: {
    instant: "Pick a time",
    group: "Reserve a seat",
    request: "Request dates",
  },
  kindExplained: {
    instant: "Pick a free time in the calendar and it is confirmed straight away.",
    group: "Take a seat on one of the dates Yasmina has set.",
    request: "Suggest a few dates and Yasmina confirms one of them within a few days.",
  },
  navHints: {
    request: "Request",
    group: "Group sessions",
    sessions: (n) => `${n} sessions`,
  },
  offerings: {
    session: {
      title: "Coaching session",
      description:
        "An hour on the decision, the conversation or the person that keeps you up at night. A good first step if you want to try coaching before you decide on a programme.",
      included: ["60 minutes, in Varberg or by video", "A short written summary afterwards"],
    },
    package_6: {
      title: "Coaching programme, 6 sessions",
      description:
        "Six hours over three to four months: one or two goals that show in behaviour, and one action for each week in between. Book the first session now and the rest when you are ready.",
      included: [
        "Six 60-minute sessions, three to four weeks apart",
        "Contact by email between sessions",
        "Cancel or move a session up to 24 hours before",
      ],
    },
    package_10: {
      title: "Coaching programme, 10 sessions",
      description:
        "Ten hours over a term or a reorganisation: time enough to change a habit, not just put words to it. Book the first session now and the rest from your booking link.",
      included: [
        "Ten 60-minute sessions, three to four weeks apart",
        "Contact by email between sessions",
        "A check-in on the goals halfway through",
      ],
    },
    group: {
      title: "Group coaching",
      description:
        "Two hours with a small group of managers who are not your colleagues. Structured, confidential and surprisingly practical: you bring a situation, and the group thinks it through with you.",
      included: ["120 minutes per session", "At most eight managers", "In Varberg or by video"],
    },
    workshop: {
      title: "Workshop or team day",
      description:
        "A half or full day for a management group or unit that needs to work as a team again: before a reorganisation, during it, or after.",
      included: [
        "A half or full day at your workplace, or by video",
        "A preparatory conversation with the manager",
        "A written follow-up of what the group agreed",
      ],
    },
    enterprise: {
      title: "Programme for organisations",
      description:
        "Coaching and supervision for several managers or a whole department over a term or a year, shaped around your organisation's situation.",
      included: [
        "A planning meeting before anything goes in the calendar",
        "Individual coaching and group sessions combined",
        "A written progress report at agreed points",
      ],
    },
    keynote: {
      title: "Talk",
      description:
        "Forty-five to sixty minutes on preventive leadership, emotional intelligence at work or leading through change, for a leadership day or a conference.",
      included: [
        "45 to 60 minutes, questions included",
        "Tailored to your audience in a short conversation",
      ],
    },
    inner_start_coaching: {
      title: "Start call, transformative coaching",
      description: `The first step in transformative coaching: ${minutes("inner_start_coaching")} minutes where you set your goals, write them down and make a plan for following them up.`,
      included: [
        `${minutes("inner_start_coaching")} minutes, in Varberg or by video`,
        "Your goals in writing, and a plan for following them up",
      ],
    },
    inner_start_mentoring: {
      title: "Start call, mentoring",
      description: `The first step in mentoring: ${minutes("inner_start_mentoring")} minutes where you set your goals, write them down and make a plan for following them up.`,
      included: [
        `${minutes("inner_start_mentoring")} minutes, in Varberg or by video`,
        "Your goals in writing, and a plan for following them up",
      ],
    },
    inner_start_lifestyle: {
      title: "Start call, lifestyle change",
      description: `The first step in lifestyle change: ${minutes("inner_start_lifestyle")} minutes where you set your goals and get a personal practice plan.`,
      included: [
        `${minutes("inner_start_lifestyle")} minutes, in Varberg or by video`,
        "A personal practice plan with breathing, yin yoga, meditation and visualisation",
      ],
    },
    inner_session: {
      title: "Member session",
      description:
        "Your ongoing session in transformative coaching or lifestyle change, for you who are already a member and have had your start call.",
      included: [`${minutes("inner_session")} minutes, in Varberg or by video`],
    },
    inner_mentoring_session: {
      title: "Member mentoring session",
      description:
        "Your ongoing session in mentoring, for you who are already a member and have had your start call.",
      included: [`${minutes("inner_mentoring_session")} minutes, in Varberg or by video`],
    },
    inner_group: {
      title: "The Inifrån group",
      description:
        "One session of the ongoing group: a theme from yoga philosophy, an exercise together and conversation about leadership and life.",
      included: [`${minutes("inner_group")} minutes, in Varberg or by video`],
    },
  },
  catalogGroups: [
    {
      id: "leadership",
      title: "Leadership coaching",
      description:
        "Sessions, programmes and assignments for managers, management teams and organisations.",
      keys: LEADERSHIP_KEYS,
    },
    {
      id: "inner",
      title: "Leading from within",
      description:
        "Personal development grounded in yoga philosophy. The one-to-one services begin with a start call, and in the group you book a seat per session.",
      keys: INNER_KEYS,
    },
  ],
  catalog: {
    eyebrow: "Book",
    title: "Choose how you want to work with Yasmina",
    description:
      "Sessions and programmes are booked straight in the calendar. Workshops, programmes for a whole organisation and talks start with a request.",
    audienceLegend: "I am booking as",
    introCall: {
      lead: "Not sure which?",
      label: "Request a free intro call",
      href: "/#contact",
    },
  },
  offering: { back: "All ways to book" },
  done: {
    eyebrow: "Done",
    booked: {
      title: "You are booked",
      body: "A confirmation is on its way to your email, with a link to manage the booking. Yasmina will have read your notes before you meet.",
    },
    requested: {
      title: "Request received",
      body: "Yasmina replies within a few days with a suggested time and a written quote. Nothing is booked until you have said yes to both.",
    },
    reference: "Your reference",
    manage: "Manage your booking",
    manageHint: "The same link is in your email confirmation, so you can come back to it later.",
    next: "What happens next",
    nextItems: {
      instant: [
        "A confirmation with the time and place lands in your inbox within a few minutes.",
        "You can cancel from your booking link up to 24 hours before a session.",
        "Yasmina sends a short preparation a day or two before you meet.",
      ],
      request: [
        "Yasmina reads your request and suggests a time, usually within a few days.",
        "You get a written quote together with the suggestion.",
        "When you say yes, the booking is confirmed by email.",
      ],
    },
    home: "Back to the home page",
  },
  manage: {
    eyebrow: "Your booking",
    title: "Manage your booking",
    bookedBy: "Booked by",
    bookings: "Sessions",
    empty: "No sessions on this booking yet.",
    packageProgress: (booked, total) => `${booked} of ${total} sessions in the calendar.`,
    bookAnother: "Book another session",
    cancelRule:
      "A confirmed session can be cancelled here up to 24 hours before it starts. Closer than that, reply to your booking confirmation instead.",
    cancelLegend: "Cancel this session",
    cancelled: "The session is cancelled.",
    notCancellable: "Too close to cancel online. Reply to your booking confirmation instead.",
    timeTbc: "Time to be confirmed by Yasmina",
  },
}

/** Both languages, one shape. */
export const BOOKING: Record<Locale, BookingContent> = { sv, en }

/** The booking pages' copy in `locale`. */
export const bookingFor = (locale: Locale): BookingContent => BOOKING[locale]
