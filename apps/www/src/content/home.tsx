import type { Locale } from "@repo/i18n/locales"
import type { FaqItem } from "@repo/ui/blocks/faq"

/**
 * Every word on the landing page, in Swedish and English. Rewrite the pitch, reorder the offers
 * or swap a photo here; `src/views/home-view.tsx` only arranges the sections. Both languages
 * share one shape (`HomeContent`), the same section ids and the same booking link, and
 * `homeFor(locale)` picks one per request (`src/lib/locale.ts`). Swedish is the site's default;
 * English shows when the visitor picks it in the header's switcher.
 */

/** The in-page sections the header links point at, in page order. The same in both languages. */
export const SECTION_IDS = ["coaching", "about", "how", "faq", "contact"] as const
export type SectionId = (typeof SECTION_IDS)[number]

/** The booking pages' entry, the one header link that leaves the landing page. */
export const BOOK_HREF = "/book"

export type NavLink = { label: string; href: `/#${SectionId}` | typeof BOOK_HREF }
export type Stat = { value: string; label: string }
export type Offer = { number: string; title: string; description: string }
export type Step = { number: string; title: string; description: string }
export type Reason = { title: string; description: string }
export type Role = { period: string; title: string; place: string; detail?: string }
export type Credential = { title: string; place: string }
type Link = { label: string; href: string }
type Heading = { eyebrow: string; title: string; description?: string }

export type HomeContent = {
  /** The page title's tail (`Yasmina Petersson · …`) and the meta description. */
  meta: { title: string; description: string }
  /** The header's links: in-page anchors, plus the booking catalog. */
  nav: NavLink[]
  hero: {
    eyebrow: string
    title: string
    description: string
    primary: { label: string; href: typeof BOOK_HREF }
    secondary: Link
    stats: Stat[]
  }
  statement: { title: string; body: string; link: Link }
  offers: { heading: Heading; items: Offer[] }
  manifesto: { lead: string; rest: string }
  why: { heading: Heading; reasons: Reason[] }
  steps: { heading: Heading; items: Step[] }
  credentials: { heading: Heading; experience: Role[]; education: Credential[] }
  faq: { heading: Heading; items: FaqItem[] }
  contact: {
    title: string
    description: string
    button: string
    legal: string
    emailLabel: string
    placeholder: string
  }
}

const sv: HomeContent = {
  meta: {
    title: "Ledarskapscoaching",
    description:
      "Ledarskapscoaching, teamutveckling och handledning för chefer inom socialtjänst, vård och skola, med Yasmina Petersson. Varberg och online.",
  },

  nav: [
    { label: "Coaching", href: "/#coaching" },
    { label: "Om Yasmina", href: "/#about" },
    { label: "Så går det till", href: "/#how" },
    { label: "Frågor", href: "/#faq" },
    { label: "Boka", href: BOOK_HREF },
  ],

  hero: {
    eyebrow: "Ledarskapscoaching · Varberg och online",
    title: "Led så som du själv skulle vilja bli ledd",
    description:
      "Coaching och handledning för chefer inom socialtjänst, vård och skola, med Yasmina Petersson: tjugo år i yrket, åtta av dem som enhetschef.",
    primary: { label: "Boka ett samtal", href: BOOK_HREF },
    secondary: { label: "Så går det till", href: "#how" },
    stats: [
      { value: "20+ år", label: "inom socialtjänsten" },
      { value: "8 år", label: "som enhetschef" },
      { value: "Steg 1", label: "psykoterapiutbildning" },
    ],
  },

  statement: {
    title: "Ditt team märker när du ser dem.",
    body: "Coaching med Yasmina börjar med människorna omkring dig: hur de kommer in en måndag, vad de har slutat säga, när de blir tysta. Sedan blir det praktiskt.",
    link: { label: "Så ser coachingen ut", href: "#coaching" },
  },

  offers: {
    heading: {
      eyebrow: "Sätt att arbeta tillsammans",
      title: "Fyra format, en fråga: vad skulle hjälpa dina medarbetare mest?",
    },
    items: [
      {
        number: "01",
        title: "Ledarskapscoaching, en till en",
        description:
          "Sex till tio samtal om de beslut, samtal och människor som kostar dig nattsömn. I Varberg eller på video.",
      },
      {
        number: "02",
        title: "Teamutveckling",
        description:
          "Halv- och heldagar för ledningsgrupper och enheter som behöver fungera som ett team igen, före och under en omorganisation.",
      },
      {
        number: "03",
        title: "Handledning för team inom socialt arbete",
        description:
          "Processhandledning med grund i systemisk och narrativ praktik, för team inom barn och unga, placeringar och behandling.",
      },
      {
        number: "04",
        title: "Föreläsningar och workshoppar",
        description:
          "Om förebyggande ledarskap, emotionell intelligens på jobbet och att leda i förändring, för en ledningsdag eller en hel förvaltning.",
      },
    ],
  },

  manifesto: {
    lead: "De flesta ledare får hjälp efter att något har gått sönder.",
    rest: "En omorganisation som gick snett, ett team som slutade lita på varandra, en chef som inte har något kvar att ge. Förebyggande arbete fungerar i ledarskap som det gör i socialtjänsten: se tidigt, prata tidigt, agera tidigt.",
  },

  why: {
    heading: { eyebrow: "Om Yasmina", title: "Hon har suttit på din stol." },
    reasons: [
      {
        title: "Erfarenhet",
        description:
          "Åtta år som enhetschef för en behandlingsenhet, barnavårdsutredningar och LSS, i dag chef för Varbergs förebyggande enhet för barn och unga. Hon känner till budgetmötet, lex Sarah-anmälan och söndagsångesten.",
      },
      {
        title: "Metod",
        description:
          "Socionom, Steg 1-psykoterapeut, två års systemisk och narrativ utbildning, tio år som familjeterapeut inom MST och TFCO. Samtalen följer en metod: systemiska frågor, narrativt arbete och hemuppgifter som faktiskt går att göra.",
      },
      {
        title: "Förhållningssätt",
        description:
          "Varm och rak. Du blir lyssnad på, och du lämnar varje samtal med en sak att göra innan nästa.",
      },
    ],
  },

  steps: {
    heading: {
      eyebrow: "Så går det till",
      title: "Tre steg, och det tredje upprepas",
      description:
        "Ett samtal säger om det här passar. Det första tillfället sätter målet. Varje tillfälle därefter flyttar det.",
    },
    items: [
      {
        number: "01",
        title: "Lyssna",
        description:
          "Ett kostnadsfritt samtal på trettio minuter. Du berättar var du står, och Yasmina säger ärligt om hon kan hjälpa till.",
      },
      {
        number: "02",
        title: "Klargöra",
        description:
          "I det första samtalet sätter du ett eller två mål som syns i beteende, ditt eget och teamets.",
      },
      {
        number: "03",
        title: "Agera",
        description:
          "Varje samtal slutar med en handling för veckan. Nästa börjar med vad som hände.",
      },
    ],
  },

  credentials: {
    heading: { eyebrow: "Bakgrund", title: "Tjugo år, i ordning" },
    experience: [
      {
        period: "2025 –",
        title: "Enhetschef, Förebyggande enheten för barn och unga",
        place: "Varbergs kommun",
      },
      {
        period: "2024 – 2025",
        title: "Verksamhetsutvecklare, socialtjänsten",
        place: "Varbergs kommun",
      },
      {
        period: "2023 – 2024",
        title: "Kurator, Barn och ungas psykiska hälsa",
        place: "Region Halland",
      },
      {
        period: "2016 – 2024",
        title: "Enhetschef",
        place: "Falkenbergs kommun",
        detail: "Behandlingsenhet; barn- och ungdomsutredningar; LSS och socialpsykiatri",
      },
      {
        period: "2015 – 2016",
        title: "Samordnare och familjeterapeut, TFCO",
        place: "Statens institutionsstyrelse",
      },
      { period: "2008 – 2014", title: "MST-terapeut", place: "Gryning Vård, Göteborg" },
      {
        period: "2004 – 2008",
        title: "Ungdoms- och familjeterapeut",
        place: "Västsvenska Mellanvårdsgruppen, Göteborg",
      },
    ],
    education: [
      { title: "Socionom", place: "Göteborgs universitet" },
      { title: "Steg 1-psykoterapeut", place: "Göteborgs psykoterapiinstitut" },
      {
        title: "Tvåårig systemisk utbildning, narrativ inriktning",
        place: "GCK, Göteborgs centrum för kompetensutveckling",
      },
      { title: "UL, Utvecklande ledarskap", place: "Falkenberg" },
      { title: "Coachande ledarskap", place: "Falkenberg" },
      { title: "Morgondagens ledare", place: "Halmstad" },
    ],
  },

  faq: {
    heading: { eyebrow: "Frågor", title: "Innan du bokar" },
    items: [
      {
        question: "Vem är coachingen för?",
        answer:
          "Första linjens chefer och mellanchefer i kommuner, regioner och skolor, och de som är på väg att bli det. De flesta klienter leder team inom socialtjänst eller omsorg.",
      },
      {
        question: "Var sker samtalen?",
        answer:
          "I Varberg, eller på video. Teamdagar och handledning sker på din arbetsplats, var som helst i Halland och Västra Götaland.",
      },
      {
        question: "Hur många samtal tar ett program?",
        answer:
          "Ett program en till en är oftast sex till tio samtal, med tre till fyra veckors mellanrum. Du kan avsluta efter vilket samtal som helst.",
      },
      {
        question: "Vad kostar det?",
        answer:
          "Priset beror på formatet. Du får en skriftlig offert efter introsamtalet, innan du binder dig till något.",
      },
      {
        question: "Är det konfidentiellt?",
        answer:
          "Ja. Det som sägs i ett samtal stannar där, även gentemot arbetsgivaren när arbetsgivaren betalar. De enda undantagen är de som svensk lag kräver.",
      },
    ],
  },

  contact: {
    title: "Börja med ett samtal",
    description:
      "Trettio minuter på telefon, kostnadsfritt, och du går därifrån med minst en sak att prova. Lämna din e-postadress så hör Yasmina av sig för att hitta en tid.",
    button: "Be om ett introsamtal",
    legal: "Yasmina svarar personligen inom några dagar. Din adress används bara för det svaret.",
    emailLabel: "E-post",
    placeholder: "du@exempel.se",
  },
}

const en: HomeContent = {
  meta: {
    title: "Leadership coaching",
    description:
      "Leadership coaching, team development and supervision for managers in social services, healthcare and schools, with Yasmina Petersson. Varberg and online.",
  },

  nav: [
    { label: "Coaching", href: "/#coaching" },
    { label: "About", href: "/#about" },
    { label: "How it works", href: "/#how" },
    { label: "Questions", href: "/#faq" },
    { label: "Book", href: BOOK_HREF },
  ],

  hero: {
    eyebrow: "Leadership coaching · Varberg and online",
    title: "Lead the way you would want to be led",
    description:
      "Coaching and supervision for managers in social services, healthcare and schools, with Yasmina Petersson: twenty years in the field, eight of them as a unit manager.",
    primary: { label: "Book a conversation", href: BOOK_HREF },
    secondary: { label: "How it works", href: "#how" },
    stats: [
      { value: "20+ years", label: "in social services" },
      { value: "8 years", label: "as a unit manager" },
      { value: "Level 1", label: "psychotherapy training" },
    ],
  },

  statement: {
    title: "Your team can tell when you see them.",
    body: "Coaching with Yasmina starts with the people around you: how they walk in on a Monday, what they have stopped saying, when they go quiet. Then it gets practical.",
    link: { label: "What the coaching looks like", href: "#coaching" },
  },

  offers: {
    heading: {
      eyebrow: "Ways to work together",
      title: "Four formats, one question: what would help your people most?",
    },
    items: [
      {
        number: "01",
        title: "One-to-one leadership coaching",
        description:
          "Six to ten conversations about the decisions, conversations and people that keep you up at night. In Varberg or by video.",
      },
      {
        number: "02",
        title: "Team development",
        description:
          "Half and full days for management groups and units that need to work as a team again, before and during a reorganisation.",
      },
      {
        number: "03",
        title: "Supervision for social work teams",
        description:
          "Process supervision grounded in systemic and narrative practice, for teams working with children and young people, placements and treatment.",
      },
      {
        number: "04",
        title: "Talks and workshops",
        description:
          "On preventive leadership, emotional intelligence at work and leading through change, for a leadership day or a whole department.",
      },
    ],
  },

  manifesto: {
    lead: "Most leaders get help after something breaks.",
    rest: "A reorganisation that went wrong, a team that stopped trusting each other, a manager with nothing left to give. Prevention works in leadership the way it works in social services: notice early, talk early, act early.",
  },

  why: {
    heading: { eyebrow: "About Yasmina", title: "She has sat in your chair." },
    reasons: [
      {
        title: "Experience",
        description:
          "Eight years as a unit manager for a treatment unit, child welfare investigations and disability services, and today head of Varberg's preventive unit for children and young people. She knows the budget meeting, the incident report and the Sunday-evening dread.",
      },
      {
        title: "Method",
        description:
          "Qualified social worker, Level 1 psychotherapist, two years of systemic and narrative training, ten years as a family therapist in MST and TFCO. The conversations follow a method: systemic questions, narrative work and homework you can actually do.",
      },
      {
        title: "Approach",
        description:
          "Warm and direct. You are listened to, and you leave every conversation with one thing to do before the next.",
      },
    ],
  },

  steps: {
    heading: {
      eyebrow: "How it works",
      title: "Three steps, and the third repeats",
      description:
        "One call tells you whether this is a fit. The first session sets the goal. Every session after that moves it.",
    },
    items: [
      {
        number: "01",
        title: "Listen",
        description:
          "A free thirty-minute call. You describe where you stand, and Yasmina tells you honestly whether she can help.",
      },
      {
        number: "02",
        title: "Clarify",
        description:
          "In the first session you set one or two goals that show in behaviour, your own and your team's.",
      },
      {
        number: "03",
        title: "Act",
        description:
          "Every session ends with one action for the week. The next one starts with what happened.",
      },
    ],
  },

  credentials: {
    heading: { eyebrow: "Background", title: "Twenty years, in order" },
    experience: [
      {
        period: "2025 –",
        title: "Head of Unit, Preventive Unit for Children and Young People",
        place: "Varberg Municipality",
      },
      {
        period: "2024 – 2025",
        title: "Development officer, social services",
        place: "Varberg Municipality",
      },
      {
        period: "2023 – 2024",
        title: "Counsellor, Children and Young People's Mental Health",
        place: "Region Halland",
      },
      {
        period: "2016 – 2024",
        title: "Unit manager",
        place: "Falkenberg Municipality",
        detail:
          "Treatment unit; child and youth investigations; disability services and community psychiatry",
      },
      {
        period: "2015 – 2016",
        title: "Coordinator and family therapist, TFCO",
        place: "Swedish National Board of Institutional Care",
      },
      { period: "2008 – 2014", title: "MST therapist", place: "Gryning Vård, Gothenburg" },
      {
        period: "2004 – 2008",
        title: "Youth and family therapist",
        place: "Västsvenska Mellanvårdsgruppen, Gothenburg",
      },
    ],
    education: [
      { title: "Qualified social worker (socionom)", place: "University of Gothenburg" },
      { title: "Level 1 psychotherapist", place: "Gothenburg Psychotherapy Institute" },
      {
        title: "Two-year systemic training, narrative focus",
        place: "GCK, Gothenburg Centre for Professional Development",
      },
      { title: "UL, Developmental Leadership", place: "Falkenberg" },
      { title: "Coaching leadership", place: "Falkenberg" },
      { title: "Leaders of Tomorrow", place: "Halmstad" },
    ],
  },

  faq: {
    heading: { eyebrow: "Questions", title: "Before you book" },
    items: [
      {
        question: "Who is the coaching for?",
        answer:
          "First-line and middle managers in municipalities, regions and schools, and people on their way to becoming one. Most clients lead teams in social services or care.",
      },
      {
        question: "Where do the sessions take place?",
        answer:
          "In Varberg, or by video. Team days and supervision take place at your workplace, anywhere in Halland and Västra Götaland.",
      },
      {
        question: "How many sessions does a programme take?",
        answer:
          "A one-to-one programme is usually six to ten sessions, three to four weeks apart. You can stop after any session.",
      },
      {
        question: "What does it cost?",
        answer:
          "The price depends on the format. You get a written quote after the intro call, before you commit to anything.",
      },
      {
        question: "Is it confidential?",
        answer:
          "Yes. What is said in a session stays there, including towards your employer when your employer pays. The only exceptions are the ones Swedish law requires.",
      },
    ],
  },

  contact: {
    title: "Start with a conversation",
    description:
      "Thirty minutes by phone, free of charge, and you leave with at least one thing to try. Leave your email address and Yasmina will get in touch to find a time.",
    button: "Request an intro call",
    legal:
      "Yasmina replies personally within a few days. Your address is used only for that reply.",
    emailLabel: "Email",
    placeholder: "you@example.com",
  },
}

/** Both languages, one shape. */
export const HOME: Record<Locale, HomeContent> = { sv, en }

/** The landing page's copy in `locale`. */
export const homeFor = (locale: Locale): HomeContent => HOME[locale]
