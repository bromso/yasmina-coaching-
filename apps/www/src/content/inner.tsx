import { OFFERINGS, type OfferingKey } from "@repo/api-contract/booking-limits"
import type { Locale } from "@repo/i18n/locales"
import type { FaqItem } from "@repo/ui/blocks/faq"
import {
  formatKr,
  INNER_HOURS,
  INNER_PRICES,
  type InnerServiceId,
  START_HOURS,
} from "@/content/inner-pricing"
import type { MediaKey } from "@/content/media"

/**
 * Every word of Ledarskap inifrån (en: Leading from within), the personal-development track: the
 * hub at `/inifran`, the four service pages at `/inifran/<slug>` and the research page at
 * `/inifran/forskning`, in Swedish and English, one shape (`InnerContent`); `innerFor(locale)`
 * picks one per request. Prices, hours and session lengths are never written by hand: they come
 * from `inner-pricing.ts` and the api contract's `OFFERINGS`, so a change there reaches the copy.
 * The paths are Swedish in both languages; the `locale` cookie picks the language.
 */

/** The track's hub. */
export const INNER_HREF = "/inifran"
/** The research page ("Så vet vi"). */
export const INNER_RESEARCH_HREF = "/inifran/forskning"
/** The booking catalog (`BOOK_HREF` in `home.tsx`, which imports this module). */
const BOOK = "/book"

/** The four services in page order. */
export const INNER_SERVICE_IDS = [
  "coaching",
  "mentoring",
  "lifestyle",
  "group",
] as const satisfies readonly InnerServiceId[]

export type InnerSlug = "coachning" | "mentorskap" | "livsstil" | "grupp"

/** A service page's path. */
export const innerServiceHref = (slug: InnerSlug) => `${INNER_HREF}/${slug}`

type Link = { label: string; href: string }
type Heading = { eyebrow: string; title: string; description: string }

export type InnerHub = {
  /** The page title and the meta description. */
  meta: { title: string; description: string }
  hero: {
    eyebrow: string
    title: string
    description: string
    image: MediaKey
    primary: Link
    secondary: Link
  }
  /** One sentence set large under the hero: what a client leaves with, in the client's words. */
  statement: string
  outcomes: { heading: Heading; items: string[] }
  /** The four service cards: their text is each service's `title` and `lead`. */
  services: { heading: Heading; more: string }
  yoga: { heading: Heading; body: string; practices: string[]; note: string }
  /** The shared model (start, membership, review, ending) as a timeline. */
  model: { heading: Heading; steps: { title: string; description: string }[] }
  certification: { eyebrow: string; title: string; line: string; body: string }
  research: { title: string; description: string; link: Link }
  faq: { heading: Heading; items: FaqItem[] }
  cta: { title: string; description: string; button: Link }
}

export type InnerService = {
  slug: InnerSlug
  title: string
  lead: string
  /** Completes `labels.forWhom` ("För dig som …"). */
  forWhom: string[]
  outcomes: string[]
  howItWorks: string[]
  /** How the yoga is used in this service. */
  yoga: string
  /** What the package holds; prices come from `INNER_PRICES`. */
  package: { start?: string; monthly: string; review: string }
  /** The paid start call, booked at `/book/<key>`. */
  startOffering?: OfferingKey
  /** The members' session, linked as "already a member" and hidden from the catalog. */
  memberOffering?: OfferingKey
  /** The group's events. */
  groupOffering?: OfferingKey
  image: MediaKey
  faq: FaqItem[]
}

export type InnerResearch = {
  intro: string
  /** Each claim cites `references[].n`. */
  findings: { claim: string; sources: number[] }[]
  limits: string[]
  references: { n: number; text: string; url: string }[]
}

/** The strings the service, price and research views share. */
export type InnerLabels = {
  trackName: string
  back: string
  readMore: string
  forWhom: string
  outcomes: string
  howItWorks: string
  yoga: string
  faq: string
  package: {
    title: string
    start: string
    monthly: string
    /** The group's price is per person. */
    monthlyPerPerson: string
    quarter: string
    vatPrivate: string
    vatOrganisation: string
    ending: string
  }
  book: { start: string; member: string; memberHint: string; group: string }
  research: {
    meta: { title: string; description: string }
    eyebrow: string
    title: string
    findings: string
    limits: string
    references: string
    back: string
  }
}

export type InnerContent = {
  hub: InnerHub
  services: Record<InnerServiceId, InnerService>
  research: InnerResearch
  labels: InnerLabels
}

/** Minutes of one session of `key`, from the contract. */
const minutes = (key: OfferingKey) => OFFERINGS[key].durationMinutes
/** The start call in minutes. */
const START_MINUTES = START_HOURS * 60
/** Sessions of `key` a month in `id`'s membership. */
export const perMonth = (id: InnerServiceId, key: OfferingKey) =>
  (INNER_HOURS[id] * 60) / minutes(key)

/** 1–4 as a word: Swedish takes the noun's gender ("ett samtal", "en gruppträff"). */
function countWord(n: number, locale: Locale, gender: "en" | "ett" = "ett"): string {
  const words = locale === "sv" ? [gender, "två", "tre", "fyra"] : ["one", "two", "three", "four"]
  const word = Number.isInteger(n) ? words[n - 1] : undefined
  return word ?? String(n)
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** "Två samtal à 60 minuter" / "Two 60-minute sessions": the membership's sessions a month. */
function sessions(id: InnerServiceId, key: OfferingKey, locale: Locale): string {
  const n = perMonth(id, key)
  const length = minutes(key)
  if (locale === "sv") {
    const noun = key === "inner_group" ? (n === 1 ? "gruppträff" : "gruppträffar") : "samtal"
    const word = countWord(n, locale, key === "inner_group" ? "en" : "ett")
    return capitalise(`${word} ${noun} à ${length} minuter`)
  }
  const noun = key === "inner_group" ? "group session" : "session"
  return capitalise(`${countWord(n, locale)} ${length}-minute ${noun}${n === 1 ? "" : "s"}`)
}

/** The "what does it cost" answer for a service, built from the price model. */
function priceAnswer(id: InnerServiceId, locale: Locale): string {
  const p = INNER_PRICES[id]
  const kr = (amount: number) => formatKr(amount, locale)
  if (locale === "sv") {
    const start = p.start === undefined ? "" : `Startsamtalet kostar ${kr(p.start)}. `
    const unit = id === "group" ? "per person och månad" : "i månaden"
    return `${start}Medlemskapet kostar ${kr(p.monthly)} ${unit}, eller ${kr(p.quarter)} för tre månader betalda i förväg. Som privatperson betalar du priset inklusive moms. Betalar din arbetsgivare gäller samma belopp exklusive moms.`
  }
  const start = p.start === undefined ? "" : `The start call costs ${kr(p.start)}. `
  const unit = id === "group" ? "per person a month" : "a month"
  return `${start}Membership costs ${kr(p.monthly)} ${unit}, or ${kr(p.quarter)} for three months paid in advance. As a private client you pay the price including VAT. If your employer pays, the same amount applies excluding VAT.`
}

/** Fourteen papers, numbered as cited; the same in both languages. */
const REFERENCES: InnerResearch["references"] = [
  {
    n: 1,
    text: "Wang, Q., Lai, Y.-L., Xu, X. & McDowall, A. (2022). The effectiveness of workplace coaching: a meta-analysis of contemporary psychologically informed coaching approaches. Journal of Work-Applied Management, 14(1), 77–101.",
    url: "https://doi.org/10.1108/JWAM-04-2021-0030",
  },
  {
    n: 2,
    text: "de Haan, E. & Nilsson, V. O. (2023). What can we know about the effectiveness of coaching? A meta-analysis based only on randomized controlled trials. Academy of Management Learning & Education, 22(4), 641–661.",
    url: "https://doi.org/10.5465/amle.2022.0107",
  },
  {
    n: 3,
    text: "Theeboom, T., Beersma, B. & van Vianen, A. E. M. (2014). Does coaching work? A meta-analysis on the effects of coaching on individual level outcomes in an organizational context. The Journal of Positive Psychology, 9(1), 1–18.",
    url: "https://doi.org/10.1080/17439760.2013.837499",
  },
  {
    n: 4,
    text: "Jones, R. J., Woods, S. A. & Guillaume, Y. R. F. (2016). The effectiveness of workplace coaching: a meta-analysis of learning and performance outcomes from coaching. Journal of Occupational and Organizational Psychology, 89(2), 249–277.",
    url: "https://doi.org/10.1111/joop.12119",
  },
  {
    n: 5,
    text: "Nicolau, A., Candel, O. S., Constantin, T. & Kleingeld, A. (2023). The effects of executive coaching on behaviors, attitudes, and personal characteristics: a meta-analysis of randomized control trial studies. Frontiers in Psychology, 14, 1089797.",
    url: "https://doi.org/10.3389/fpsyg.2023.1089797",
  },
  {
    n: 6,
    text: "Bartlett, L., Martin, A., Neil, A. L., Memish, K., Otahal, P., Kilpatrick, M. & Sanderson, K. (2019). A systematic review and meta-analysis of workplace mindfulness training randomized controlled trials. Journal of Occupational Health Psychology, 24(1), 108–126.",
    url: "https://doi.org/10.1037/ocp0000146",
  },
  {
    n: 7,
    text: "Della Valle, E., Palermi, S., Aloe, I., Marcantonio, R., Spera, R., Montagnani, S. & Sirico, F. (2020). Effectiveness of workplace yoga interventions to reduce perceived stress in employees: a systematic review and meta-analysis. Journal of Functional Morphology and Kinesiology, 5(2), 33.",
    url: "https://doi.org/10.3390/jfmk5020033",
  },
  {
    n: 8,
    text: "Tenschert, J., Liegl, S., Peters, M. & Furtner, M. (2026). Mindfulness-based self-leadership training to enhance leaders' self-efficacy and resilience: a randomised controlled intervention study. Leadership & Organization Development Journal, 47(8), 1565–1589.",
    url: "https://doi.org/10.1108/lodj-05-2025-0394",
  },
  {
    n: 9,
    text: "Donaldson-Feilder, E., Lewis, R. & Yarker, J. (2019). What outcomes have mindfulness and meditation interventions for managers and leaders achieved? A systematic review. European Journal of Work and Organizational Psychology, 28(1), 11–29.",
    url: "https://doi.org/10.1080/1359432X.2018.1542379",
  },
  {
    n: 10,
    text: "Urrila, L. I. (2022). From personal wellbeing to relationships: a systematic review on the impact of mindfulness interventions and practices on leaders. Human Resource Management Review, 32(3), 100837.",
    url: "https://doi.org/10.1016/j.hrmr.2021.100837",
  },
  {
    n: 11,
    text: "Tenschert, J., Furtner, M. & Peters, M. (2025). The effects of self-leadership and mindfulness training on leadership development: a systematic review. Management Review Quarterly, 75(4), 2811–2862.",
    url: "https://doi.org/10.1007/s11301-024-00448-7",
  },
  {
    n: 12,
    text: "Sutton, A. (2020). Living the good life: a meta-analysis of authenticity, well-being and engagement. Personality and Individual Differences, 153, 109645.",
    url: "https://doi.org/10.1016/j.paid.2019.109645",
  },
  {
    n: 13,
    text: "Sheldon, K. M. & Houser-Marko, L. (2001). Self-concordance, goal attainment, and the pursuit of happiness: can there be an upward spiral? Journal of Personality and Social Psychology, 80(1), 152–165.",
    url: "https://doi.org/10.1037/0022-3514.80.1.152",
  },
  {
    n: 14,
    text: "Jongman-Sereno, K. P. & Leary, M. R. (2019). The enigma of being yourself: a critical examination of the concept of authenticity. Review of General Psychology, 23(1), 133–142.",
    url: "https://doi.org/10.1037/gpr0000157",
  },
]

const sv: InnerContent = {
  hub: {
    meta: {
      title: "Ledarskap inifrån",
      description:
        "Coachning, mentorskap, livsstilsförändring och en löpande grupp med yogans filosofi som grund, för ledare och privatpersoner. Med Yasmina Petersson i Varberg och på video.",
    },
    hero: {
      eyebrow: "Ledarskap inifrån · Varberg och på video",
      title: "Starkt ledarskap börjar från insidan",
      description:
        "Personlig utveckling med yogans filosofi som ram och samtalet som verktyg, för dig som leder andra och för dig som vill leda ditt eget liv. Du sätter målen, och ni följer upp dem så länge du vill.",
      image: "portraitStudy",
      primary: { label: "Se de fyra vägarna", href: "#services" },
      secondary: { label: "Så vet vi", href: INNER_RESEARCH_HREF },
    },
    statement:
      "Målet är att du går därifrån stärkt, mer grundad i dina beslut och med en större tro på dig själv och din förmåga.",
    outcomes: {
      heading: {
        eyebrow: "Det du arbetar mot",
        title: "Det här kan dina mål handla om",
        description: "Exakt hur det ser ut för dig formulerar ni i dina mål vid startsamtalet.",
      },
      items: [
        "Att känna dig stärkt och självsäkrare",
        "Att tro mer på dig själv och på din egen förmåga",
        "Att hitta din egen kärna, det du står på när det blåser",
        "Att bli mer grundad i dina beslut",
        "Att det du gör hänger ihop med det du värderar",
        "Att hitta ditt eget sätt och lita på det",
      ],
    },
    services: {
      heading: {
        eyebrow: "Fyra vägar in",
        title: "Välj formen som passar dig nu",
        description:
          "Tre av dem är enskilda samtal som börjar med ett startsamtal där du sätter dina mål. Den fjärde är en grupp som träffas löpande.",
      },
      more: "Läs mer",
    },
    yoga: {
      heading: {
        eyebrow: "Yogan i praktiken",
        title: "Samtalet är kärnan och yogan ger ramen",
        description: "Du behöver inga förkunskaper i yoga.",
      },
      body: "Yogans filosofi ger ord åt sådant som annars är svårt att få grepp om. Yamas och niyamas, yogans riktlinjer för hur du förhåller dig till andra och till dig själv, blir ett sätt att arbeta med dina värderingar. Svadhyaya, självstudier, blir reflektionen mellan samtalen. Dharma, din riktning, hjälper dig att se vart du är på väg.",
      practices: ["Andning", "Kort rörelse", "Yin yoga", "Meditation", "Visualisering"],
      note: "Övningarna används när de hjälper dig att landa och känna efter. Det är ingen prestation.",
    },
    model: {
      heading: {
        eyebrow: "Så går det till",
        title: "Ett startsamtal, sedan så länge du vill",
        description:
          "Det som gör skillnad är tydliga mål och att ni följer upp dem. Därför styrs längden av dina mål och av vad du själv vill.",
      },
      steps: [
        {
          title: "Startsamtal",
          description: `Ett samtal på ${START_MINUTES} minuter där ni sätter dina mål, skriver ned dem och gör en plan för uppföljning.`,
        },
        {
          title: "Medlemskap",
          description:
            "Ett fast antal träffar i månaden, enskilt eller i grupp. Mellan träffarna prövar du det ni har pratat om.",
        },
        {
          title: "Avstämning",
          description:
            "Var tredje månad stämmer ni av mot målen. Har något ändrats i ditt liv kan målen ändras med det.",
        },
        {
          title: "Avslut",
          description:
            "Du avslutar när målen är nådda eller när du själv vill. Det finns ingen bindningstid efter startsamtalet.",
        },
      ],
    },
    certification: {
      eyebrow: "Om Yasmina",
      title: "Utbildad i samtal och i yoga",
      line: "Certifierad yogalärare, registrerad hos Yoga Alliance (200 timmar), med 50 timmar fördjupning i yin yoga",
      body: "Yasmina är socionom med tvåårig systemisk utbildning med narrativ inriktning, har tjugo år i yrket och var enhetschef i åtta av dem. Samtalen bygger på den erfarenheten, och yogan ger dem en ram.",
    },
    research: {
      title: "Så vet vi",
      description:
        "Vad forskningen säger om coachning, mindfulness, yoga och att leva i linje med sina värderingar, och var den slutar.",
      link: { label: "Läs om forskningen", href: INNER_RESEARCH_HREF },
    },
    faq: {
      heading: {
        eyebrow: "Frågor",
        title: "Innan du börjar",
        description: "Har du en fråga som inte står här kan du ta upp den i startsamtalet.",
      },
      items: [
        {
          question: "Behöver jag kunna yoga?",
          answer:
            "Nej. Övningarna anpassas efter dig och din kropp, och det mesta av arbetet sker i samtalet.",
        },
        {
          question: "Vad gör jag om jag mår dåligt?",
          answer:
            "Ledarskap inifrån är coachning och personlig utveckling, och ingen terapi eller vård. Behöver du behandling för stress, utmattning, ångest eller depression är vården rätt ställe att börja, och Yasmina hjälper dig gärna att hitta dit.",
        },
        {
          question: "Kan min arbetsgivare betala?",
          answer:
            "Ja. Tjänsterna passar både dig som betalar själv och dig vars arbetsgivare betalar. För organisationer gäller priserna exklusive moms.",
        },
        {
          question: "Var träffas vi?",
          answer:
            "De enskilda samtalen sker i Varberg eller på video. Gruppen träffas i Varberg eller på video, olika från gång till gång.",
        },
        {
          question: "Hur länge håller det på?",
          answer:
            "Så länge du vill fortsätta, eller tills målen är nådda. Var tredje månad stämmer ni av och ser om målen behöver ändras.",
        },
      ],
    },
    cta: {
      title: "Börja med ett startsamtal",
      description:
        "Välj den väg som låter mest som du. Startsamtalet och gruppens träffar bokar du direkt i kalendern.",
      button: { label: "Se lediga tider", href: BOOK },
    },
  },

  services: {
    coaching: {
      slug: "coachning",
      title: "Transformativ coachning",
      lead: "Enskilda samtal för dig som vill hitta din egen kärna: vad du värderar, vad du står för och hur det syns i dina beslut. För ledare och för dig som vill utvecklas som person.",
      forWhom: [
        "leder andra och vill fatta beslut du kan stå för",
        "står inför ett vägval i jobbet eller i livet",
        "ofta anpassar dig och vill hitta tillbaka till ditt eget",
        "vill känna dig tryggare i din roll",
      ],
      outcomes: [
        "En tydligare bild av dina värderingar och hur de styr det du gör",
        "Mer tillit till din egen bedömning",
        "Ett lugnare sätt att fatta beslut",
        "Mål som du själv har satt och kan följa",
      ],
      howItWorks: [
        `Ett startsamtal på ${START_MINUTES} minuter där ni sätter dina mål och skriver ned dem`,
        `${sessions("coaching", "inner_session", "sv")} i månaden, i Varberg eller på video`,
        "Små saker att pröva mellan samtalen",
        "Avstämning mot målen var tredje månad",
      ],
      yoga: "Yamas och niyamas, yogans riktlinjer för hur du förhåller dig till andra och till dig själv, blir ett sätt att undersöka dina värderingar. Svadhyaya, självstudier, blir en vana att reflektera mellan samtalen. En kort andningsövning i början hjälper dig att landa.",
      package: {
        start: `Startsamtal, ${START_MINUTES} minuter: ni sätter dina mål, skriver ned dem och gör en plan för uppföljning.`,
        monthly: `${sessions("coaching", "inner_session", "sv")} i månaden.`,
        review: "Avstämning mot målen var tredje månad, där målen kan revideras.",
      },
      startOffering: "inner_start_coaching",
      memberOffering: "inner_session",
      image: "portraitPark",
      faq: [
        { question: "Vad kostar det?", answer: priceAnswer("coaching", "sv") },
        {
          question: "Hur skiljer det sig från ledarskapscoachingen?",
          answer:
            "Ledarskapscoachingen utgår från ditt team och din vardag som chef. Här börjar arbetet i dig: dina värderingar, din kärna och hur du fattar beslut.",
        },
      ],
    },
    mentoring: {
      slug: "mentorskap",
      title: "Mentorskap",
      lead: "En längre relation med glesare och längre träffar, för dig som vill ha någon vid din sida över tid. Yasmina delar av tjugo års erfarenhet av socialt arbete och ledarskap, och ni har kontakt via mejl mellan träffarna.",
      forWhom: [
        "är ny som chef eller på väg in i en större roll",
        "vill ha ett bollplank som har varit där du är",
        "vill utvecklas i din egen takt under en längre tid",
      ],
      outcomes: [
        "Ett sammanhang där du kan tänka högt om svåra beslut",
        "Erfarenhet du kan låna av och pröva mot din egen",
        "Större tro på din egen förmåga i rollen",
        "Mål som följs upp över tid",
      ],
      howItWorks: [
        `Ett startsamtal på ${START_MINUTES} minuter där ni sätter dina mål och skriver ned dem`,
        `${sessions("mentoring", "inner_mentoring_session", "sv")} i månaden, i Varberg eller på video`,
        "Kontakt via mejl mellan träffarna",
        "Avstämning mot målen var tredje månad",
      ],
      yoga: "Dharma, din riktning, är en tråd genom mentorskapet: vart är du på väg, och stämmer vägen med det du värderar? Om du vill börjar träffarna med några minuters andning eller stillhet.",
      package: {
        start: `Startsamtal, ${START_MINUTES} minuter: ni sätter dina mål, skriver ned dem och gör en plan för uppföljning.`,
        monthly: `${sessions("mentoring", "inner_mentoring_session", "sv")} i månaden, och kontakt via mejl mellan träffarna.`,
        review: "Avstämning mot målen var tredje månad, där målen kan revideras.",
      },
      startOffering: "inner_start_mentoring",
      memberOffering: "inner_mentoring_session",
      image: "portraitOutdoors",
      faq: [
        { question: "Vad kostar det?", answer: priceAnswer("mentoring", "sv") },
        {
          question: "Vad är skillnaden mot coachning?",
          answer:
            "I mentorskapet delar Yasmina mer av sin egen erfarenhet, och träffarna är längre och glesare. I coachningen kommer svaren oftare från dig själv.",
        },
      ],
    },
    lifestyle: {
      slug: "livsstil",
      title: "Livsstilsförändring",
      lead: "För dig som vill ändra vanor kring återhämtning, stress och vardag, och få dem att hålla. Du får en personlig övningsplan med andning, yin yoga, meditation och visualisering, som ni ändrar efter hand.",
      forWhom: [
        "märker att du sällan hinner återhämta dig",
        "vill ha vanor som håller också när det är mycket",
        "vill börja med andning, yin eller meditation och ha någon som hjälper dig igång",
      ],
      outcomes: [
        "En övningsplan som passar din vardag",
        "Vanor för återhämtning som du själv har valt",
        "Bättre koll på vad som tar och vad som ger energi",
        "Mål som följs upp och ändras när livet ändras",
      ],
      howItWorks: [
        `Ett startsamtal på ${START_MINUTES} minuter där ni sätter dina mål och du får din övningsplan`,
        `${sessions("lifestyle", "inner_session", "sv")} i månaden, i Varberg eller på video`,
        "Planen ses över i samtalen och ändras efter hand",
        "Avstämning mot målen var tredje månad",
      ],
      yoga: "Här får yogans praktik mest plats. Andning, yin yoga, meditation och visualisering blir din övningsplan, i den längd som går att få in i din vecka. Övningarna är till för att du ska landa och känna efter.",
      package: {
        start: `Startsamtal, ${START_MINUTES} minuter, och en personlig övningsplan.`,
        monthly: `${sessions("lifestyle", "inner_session", "sv")} i månaden, och planen revideras.`,
        review: "Avstämning mot målen var tredje månad, där målen kan revideras.",
      },
      startOffering: "inner_start_lifestyle",
      memberOffering: "inner_session",
      image: "sessionLounge",
      faq: [
        { question: "Vad kostar det?", answer: priceAnswer("lifestyle", "sv") },
        {
          question: "Hur mycket tid behöver jag mellan samtalen?",
          answer:
            "Det bestämmer ni tillsammans. Planen byggs efter den tid du faktiskt har och kan börja med några minuter om dagen.",
        },
      ],
    },
    group: {
      slug: "grupp",
      title: "Inifrån-gruppen",
      lead: "En löpande grupp där yogans filosofi, en gemensam övning och samtal om ledarskap och liv möts. Ni träffas regelbundet, i Varberg eller på video.",
      forWhom: [
        "vill utvecklas tillsammans med andra",
        "är nyfiken på yogans filosofi och vill pröva den i vardagen",
        "leder andra och vill ha ett sammanhang utanför jobbet",
      ],
      outcomes: [
        "Ett sammanhang att utvecklas i över tid",
        "Andras perspektiv på det du står i",
        "En egen praktik med andning, rörelse och meditation",
        "Ord för dina värderingar och för hur du vill leva dem",
      ],
      howItWorks: [
        `${sessions("group", "inner_group", "sv")} i månaden`,
        "Varje träff har ett tema ur yogans filosofi, en övning och ett samtal",
        "Du bokar din plats i kalendern, en träff i taget",
        "Ingen bindningstid",
      ],
      yoga: "Varje träff utgår från ett tema ur yogans filosofi, till exempel yamas och niyamas, yogans riktlinjer för hur du förhåller dig till andra och till dig själv. Ni gör en övning tillsammans och pratar om vad temat betyder i ditt ledarskap och ditt liv.",
      package: {
        monthly: `${sessions("group", "inner_group", "sv")} i månaden.`,
        review: "Du är med så länge du vill och kan sluta när du vill.",
      },
      groupOffering: "inner_group",
      image: "workshopTable",
      faq: [
        { question: "Vad kostar det?", answer: priceAnswer("group", "sv") },
        {
          question: "Behöver jag vara chef?",
          answer:
            "Nej. Gruppen är öppen för alla som vill arbeta med ledarskap, också ledarskapet över det egna livet.",
        },
      ],
    },
  },

  research: {
    intro:
      "Här är vad forskningen säger om det som Ledarskap inifrån bygger på, och var den slutar. Siffrorna hänvisar till källorna längst ned på sidan.",
    findings: [
      {
        claim:
          "Coachning ger tydliga effekter på hur väl människor når sina mål och på självförmåga, tilltron till den egna förmågan.",
        sources: [1, 2, 3],
      },
      {
        claim:
          "Upplägg som kombinerar flera metoder ger något större effekt än upplägg med en enda metod.",
        sources: [1],
      },
      {
        claim:
          "Effekten verkar inte växa med antalet samtal eller med hur länge coachningen pågår.",
        sources: [4, 2, 5],
      },
      {
        claim:
          "Mindfulnessträning på arbetsplatsen minskar upplevd stress och ångest och ökar välmående, enligt en sammanställning av 23 randomiserade studier.",
        sources: [6],
      },
      { claim: "Yoga på arbetsplatsen minskar upplevd stress.", sources: [7] },
      {
        claim:
          "Sex veckors mindfulnessbaserad självledarskapsträning ökade självförmåga, resiliens och självledarskap i en randomiserad studie med 128 ledare.",
        sources: [8],
      },
      {
        claim:
          "Översikter över mindfulness för ledare visar bättre självreglering, men studierna håller varierande kvalitet.",
        sources: [9, 10, 11],
      },
      {
        claim:
          "Upplevd autenticitet hänger ihop med välmående (r = 0,40) och med engagemang i arbetet (r = 0,37), i en sammanställning av 75 studier med 36 533 deltagare.",
        sources: [12],
      },
      {
        claim: "Mål som stämmer med egna värderingar uppnås oftare och ger mer välmående.",
        sources: [13],
      },
      {
        claim:
          "Begreppet autenticitet är omdiskuterat i forskningen. Därför talar Yasmina om att leva i linje med sina värderingar snarare än om ett sant jag.",
        sources: [14],
      },
    ],
    limits: [
      "Det finns inga belägg för att mindfulnessträning för ledare påverkar deras medarbetare eller team. Därför lovar Yasmina inget om ditt team.",
      "Forskningen visar inte att fler samtal i sig ger större effekt. Därför avgör dina mål hur länge ni håller på.",
      "Studierna om stress mäter upplevd stress, alltså hur deltagarna själva skattar den.",
      "Att autenticitet hänger ihop med välmående är ett samband. Det säger inget om vad som orsakar vad.",
    ],
    references: REFERENCES,
  },

  labels: {
    trackName: "Ledarskap inifrån",
    back: "Alla vägar i Ledarskap inifrån",
    readMore: "Läs mer",
    forWhom: "För dig som",
    outcomes: "Det här arbetar ni mot",
    howItWorks: "Så går det till",
    yoga: "Yogan i praktiken",
    faq: "Frågor",
    package: {
      title: "Paket och pris",
      start: "Startsamtal",
      monthly: "Per månad",
      monthlyPerPerson: "Per person och månad",
      quarter: "Tre månader i förväg",
      vatPrivate: "inkl. moms för privatpersoner",
      vatOrganisation: "exkl. moms för organisationer",
      ending:
        "Du avslutar när målen är nådda eller när du vill. Ingen bindningstid efter startsamtalet.",
    },
    book: {
      start: "Boka startsamtal",
      member: "Är du redan med? Boka ditt nästa samtal",
      memberHint: "För dig som redan är med",
      group: "Boka en plats i gruppen",
    },
    research: {
      meta: {
        title: "Så vet vi",
        description:
          "Vad forskningen säger och inte säger om coachning, mindfulness, yoga och värderingar, med källor.",
      },
      eyebrow: "Så vet vi",
      title: "Vad forskningen säger och var den slutar",
      findings: "Det forskningen visar",
      limits: "Det forskningen inte visar",
      references: "Källor",
      back: "Tillbaka till Ledarskap inifrån",
    },
  },
}

const en: InnerContent = {
  hub: {
    meta: {
      title: "Leading from within",
      description:
        "Coaching, mentoring, lifestyle change and an ongoing group grounded in yoga philosophy, for leaders and private clients. With Yasmina Petersson in Varberg and by video.",
    },
    hero: {
      eyebrow: "Leading from within · Varberg and by video",
      title: "Strong leadership starts on the inside",
      description:
        "Personal development with yoga philosophy as the frame and conversation as the tool, for people who lead others and for anyone who wants to take the lead in their own life. You set the goals, and you follow them up together for as long as you want.",
      image: "portraitStudy",
      primary: { label: "See the four paths", href: "#services" },
      secondary: { label: "How we know", href: INNER_RESEARCH_HREF },
    },
    statement:
      "The aim is that you leave stronger, more grounded in your decisions and with a greater belief in yourself and what you can do.",
    outcomes: {
      heading: {
        eyebrow: "What you work towards",
        title: "What your goals might be about",
        description: "Exactly what this looks like for you goes into your goals at the start call.",
      },
      items: [
        "Feeling stronger and more self-assured",
        "Believing more in yourself and in what you can do",
        "Finding your own core, what you stand on when things get rough",
        "Becoming more grounded in your decisions",
        "Making what you do fit with what you value",
        "Finding your own way and trusting it",
      ],
    },
    services: {
      heading: {
        eyebrow: "Four ways in",
        title: "Choose the form that suits you now",
        description:
          "Three of them are one-to-one conversations that begin with a start call where you set your goals. The fourth is a group that meets on an ongoing basis.",
      },
      more: "Read more",
    },
    yoga: {
      heading: {
        eyebrow: "Yoga in practice",
        title: "Conversation is the core and yoga gives the frame",
        description: "You need no experience of yoga.",
      },
      body: "Yoga philosophy puts words to things that are otherwise hard to get hold of. The yamas and niyamas, yoga's guidelines for how you relate to others and to yourself, become a way to work with your values. Svadhyaya, self-study, becomes the reflection between sessions. Dharma, your direction, helps you see where you are heading.",
      practices: ["Breathing", "Short movement", "Yin yoga", "Meditation", "Visualisation"],
      note: "The exercises are used when they help you settle and notice how you feel. It is not a performance.",
    },
    model: {
      heading: {
        eyebrow: "How it works",
        title: "One start call, then for as long as you want",
        description:
          "What makes the difference is clear goals and following them up. So the length is set by your goals and by what you want.",
      },
      steps: [
        {
          title: "Start call",
          description: `A ${START_MINUTES}-minute conversation where you set your goals, write them down and make a plan for following them up.`,
        },
        {
          title: "Membership",
          description:
            "A fixed number of sessions a month, one-to-one or in a group. Between sessions you try out what you have talked about.",
        },
        {
          title: "Review",
          description:
            "Every third month you check in against your goals. If something in your life has changed, the goals can change with it.",
        },
        {
          title: "Ending",
          description:
            "You stop when your goals are reached or whenever you want. There is no commitment period after the start call.",
        },
      ],
    },
    certification: {
      eyebrow: "About Yasmina",
      title: "Trained in conversation and in yoga",
      line: "Certified yoga teacher, registered with Yoga Alliance (200 hours), with 50 hours of further training in yin yoga",
      body: "Yasmina is a qualified social worker with two years of systemic training with a narrative focus, twenty years in the field and eight of them as a unit manager. The conversations build on that experience, and yoga gives them a frame.",
    },
    research: {
      title: "How we know",
      description:
        "What research says about coaching, mindfulness, yoga and living in line with your values, and where it stops.",
      link: { label: "Read about the research", href: INNER_RESEARCH_HREF },
    },
    faq: {
      heading: {
        eyebrow: "Questions",
        title: "Before you start",
        description: "If your question is not here, you can bring it up in the start call.",
      },
      items: [
        {
          question: "Do I need to know yoga?",
          answer:
            "No. The exercises are adapted to you and your body, and most of the work happens in conversation.",
        },
        {
          question: "What if I am not feeling well?",
          answer:
            "Leading from within is coaching and personal development, and neither therapy nor healthcare. If you need treatment for stress, burnout, anxiety or depression, healthcare is the right place to start, and Yasmina is glad to help you find your way there.",
        },
        {
          question: "Can my employer pay?",
          answer:
            "Yes. The services work whether you pay yourself or your employer pays. For organisations, prices are excluding VAT.",
        },
        {
          question: "Where do we meet?",
          answer:
            "One-to-one sessions take place in Varberg or by video. The group meets in Varberg or by video, depending on the session.",
        },
        {
          question: "How long does it go on?",
          answer:
            "For as long as you want to continue, or until your goals are reached. Every third month you check in and see whether the goals need to change.",
        },
      ],
    },
    cta: {
      title: "Begin with a start call",
      description:
        "Choose the path that sounds most like you. You book the start call and the group's sessions straight in the calendar.",
      button: { label: "See available times", href: BOOK },
    },
  },

  services: {
    coaching: {
      slug: "coachning",
      title: "Transformative coaching",
      lead: "One-to-one conversations about finding your own core: what you value, what you stand for and how it shows in your decisions. For leaders, and for anyone who wants to grow as a person.",
      forWhom: [
        "lead others and want to make decisions you can stand behind",
        "face a choice of direction at work or in life",
        "often adapt to others and want to find your way back to your own",
        "want to feel more confident in your role",
      ],
      outcomes: [
        "A clearer picture of your values and how they steer what you do",
        "More trust in your own judgement",
        "A calmer way of making decisions",
        "Goals you have set yourself and can follow",
      ],
      howItWorks: [
        `A ${START_MINUTES}-minute start call where you set your goals and write them down`,
        `${sessions("coaching", "inner_session", "en")} a month, in Varberg or by video`,
        "Small things to try between sessions",
        "A review against your goals every third month",
      ],
      yoga: "The yamas and niyamas, yoga's guidelines for how you relate to others and to yourself, become a way to look into your values. Svadhyaya, self-study, becomes a habit of reflecting between sessions. A short breathing exercise at the start helps you settle.",
      package: {
        start: `Start call, ${START_MINUTES} minutes: you set your goals, write them down and make a plan for following them up.`,
        monthly: `${sessions("coaching", "inner_session", "en")} a month.`,
        review: "A review against your goals every third month, where the goals can be revised.",
      },
      startOffering: "inner_start_coaching",
      memberOffering: "inner_session",
      image: "portraitPark",
      faq: [
        { question: "What does it cost?", answer: priceAnswer("coaching", "en") },
        {
          question: "How is it different from the leadership coaching?",
          answer:
            "The leadership coaching starts from your team and your everyday life as a manager. Here the work starts in you: your values, your core and how you make decisions.",
        },
      ],
    },
    mentoring: {
      slug: "mentorskap",
      title: "Mentoring",
      lead: "A longer relationship with fewer, longer meetings, if you want someone at your side over time. Yasmina shares from twenty years of experience in social work and leadership, and you stay in touch by email between meetings.",
      forWhom: [
        "are new as a manager or moving into a bigger role",
        "want a sounding board who has been where you are",
        "want to grow at your own pace over a longer period",
      ],
      outcomes: [
        "A place where you can think out loud about hard decisions",
        "Experience you can borrow from and test against your own",
        "Greater belief in what you can do in your role",
        "Goals that are followed up over time",
      ],
      howItWorks: [
        `A ${START_MINUTES}-minute start call where you set your goals and write them down`,
        `${sessions("mentoring", "inner_mentoring_session", "en")} a month, in Varberg or by video`,
        "Contact by email between meetings",
        "A review against your goals every third month",
      ],
      yoga: "Dharma, your direction, is a thread through the mentoring: where are you heading, and does the path fit what you value? If you like, meetings begin with a few minutes of breathing or stillness.",
      package: {
        start: `Start call, ${START_MINUTES} minutes: you set your goals, write them down and make a plan for following them up.`,
        monthly: `${sessions("mentoring", "inner_mentoring_session", "en")} a month, and contact by email between meetings.`,
        review: "A review against your goals every third month, where the goals can be revised.",
      },
      startOffering: "inner_start_mentoring",
      memberOffering: "inner_mentoring_session",
      image: "portraitOutdoors",
      faq: [
        { question: "What does it cost?", answer: priceAnswer("mentoring", "en") },
        {
          question: "How is it different from coaching?",
          answer:
            "In mentoring Yasmina shares more of her own experience, and the meetings are longer and further apart. In coaching the answers more often come from you.",
        },
      ],
    },
    lifestyle: {
      slug: "livsstil",
      title: "Lifestyle change",
      lead: "For people who want to change habits around rest, stress and everyday life, and make them last. You get a personal practice plan with breathing, yin yoga, meditation and visualisation, which you adjust together as you go.",
      forWhom: [
        "notice that you rarely get time to recover",
        "want habits that hold up when things get busy",
        "want to start with breathing, yin or meditation and have someone help you get going",
      ],
      outcomes: [
        "A practice plan that fits your everyday life",
        "Habits for rest that you have chosen yourself",
        "A better sense of what drains and what gives you energy",
        "Goals that are followed up and change when life changes",
      ],
      howItWorks: [
        `A ${START_MINUTES}-minute start call where you set your goals and get your practice plan`,
        `${sessions("lifestyle", "inner_session", "en")} a month, in Varberg or by video`,
        "The plan is looked at in the sessions and adjusted as you go",
        "A review against your goals every third month",
      ],
      yoga: "Here yoga practice gets the most room. Breathing, yin yoga, meditation and visualisation become your practice plan, in a length that fits into your week. The exercises are there to help you settle and notice how you feel.",
      package: {
        start: `Start call, ${START_MINUTES} minutes, and a personal practice plan.`,
        monthly: `${sessions("lifestyle", "inner_session", "en")} a month, and the plan is revised.`,
        review: "A review against your goals every third month, where the goals can be revised.",
      },
      startOffering: "inner_start_lifestyle",
      memberOffering: "inner_session",
      image: "sessionLounge",
      faq: [
        { question: "What does it cost?", answer: priceAnswer("lifestyle", "en") },
        {
          question: "How much time do I need between sessions?",
          answer:
            "You decide that together. The plan is built around the time you actually have and can start with a few minutes a day.",
        },
      ],
    },
    group: {
      slug: "grupp",
      title: "The Inifrån group",
      lead: "An ongoing group where yoga philosophy, a shared exercise and conversation about leadership and life come together. You meet regularly, in Varberg or by video.",
      forWhom: [
        "want to grow together with others",
        "are curious about yoga philosophy and want to try it in everyday life",
        "lead others and want a circle outside work",
      ],
      outcomes: [
        "A circle to grow in over time",
        "Other people's views on what you are going through",
        "A practice of your own with breathing, movement and meditation",
        "Words for your values and for how you want to live them",
      ],
      howItWorks: [
        `${sessions("group", "inner_group", "en")} a month`,
        "Each session has a theme from yoga philosophy, an exercise and a conversation",
        "You book your seat in the calendar, one session at a time",
        "No commitment period",
      ],
      yoga: "Each session starts from a theme in yoga philosophy, for example the yamas and niyamas, yoga's guidelines for how you relate to others and to yourself. You do an exercise together and talk about what the theme means in your leadership and your life.",
      package: {
        monthly: `${sessions("group", "inner_group", "en")} a month.`,
        review: "You take part for as long as you want and can stop whenever you want.",
      },
      groupOffering: "inner_group",
      image: "workshopTable",
      faq: [
        { question: "What does it cost?", answer: priceAnswer("group", "en") },
        {
          question: "Do I need to be a manager?",
          answer:
            "No. The group is open to everyone who wants to work on leadership, including leading their own life.",
        },
      ],
    },
  },

  research: {
    intro:
      "This is what research says about what Leading from within builds on, and where it stops. The numbers refer to the sources at the bottom of the page.",
    findings: [
      {
        claim:
          "Coaching has clear effects on how well people reach their goals and on self-efficacy, their belief in their own ability.",
        sources: [1, 2, 3],
      },
      {
        claim:
          "Approaches that combine several methods have a somewhat larger effect than a single method.",
        sources: [1],
      },
      {
        claim:
          "The effect does not seem to grow with the number of sessions or with how long the coaching lasts.",
        sources: [4, 2, 5],
      },
      {
        claim:
          "Mindfulness training at work reduces perceived stress and anxiety and increases well-being, according to a synthesis of 23 randomised studies.",
        sources: [6],
      },
      { claim: "Yoga at work reduces perceived stress.", sources: [7] },
      {
        claim:
          "Six weeks of mindfulness-based self-leadership training increased self-efficacy, resilience and self-leadership in a randomised study of 128 leaders.",
        sources: [8],
      },
      {
        claim:
          "Reviews of mindfulness for leaders show better self-regulation, but the studies vary in quality.",
        sources: [9, 10, 11],
      },
      {
        claim:
          "Perceived authenticity is associated with well-being (r = 0.40) and with work engagement (r = 0.37), in a synthesis of 75 studies with 36,533 participants.",
        sources: [12],
      },
      {
        claim: "Goals that fit your own values are reached more often and bring more well-being.",
        sources: [13],
      },
      {
        claim:
          "The concept of authenticity is debated in research. That is why Yasmina talks about living in line with your values rather than about a true self.",
        sources: [14],
      },
    ],
    limits: [
      "There is no evidence that mindfulness training for leaders affects their employees or teams. So Yasmina promises nothing about your team.",
      "Research does not show that more sessions in themselves give a larger effect. So your goals decide how long you keep going.",
      "The studies on stress measure perceived stress, meaning how participants rate it themselves.",
      "That authenticity goes together with well-being is an association. It says nothing about what causes what.",
    ],
    references: REFERENCES,
  },

  labels: {
    trackName: "Leading from within",
    back: "All paths in Leading from within",
    readMore: "Read more",
    forWhom: "This is for you if you",
    outcomes: "What you work towards",
    howItWorks: "How it works",
    yoga: "Yoga in practice",
    faq: "Questions",
    package: {
      title: "Package and price",
      start: "Start call",
      monthly: "Per month",
      monthlyPerPerson: "Per person per month",
      quarter: "Three months in advance",
      vatPrivate: "incl. VAT for private clients",
      vatOrganisation: "excl. VAT for organisations",
      ending:
        "You stop when your goals are reached or whenever you want. No commitment period after the start call.",
    },
    book: {
      start: "Book a start call",
      member: "Are you already a member? Book your next session",
      memberHint: "If you are already a member",
      group: "Book a seat in the group",
    },
    research: {
      meta: {
        title: "How we know",
        description:
          "What research says and does not say about coaching, mindfulness, yoga and values, with sources.",
      },
      eyebrow: "How we know",
      title: "What research says and where it stops",
      findings: "What research shows",
      limits: "What research does not show",
      references: "Sources",
      back: "Back to Leading from within",
    },
  },
}

/** Both languages, one shape. */
export const INNER: Record<Locale, InnerContent> = { sv, en }

/** The track's copy in `locale`. */
export const innerFor = (locale: Locale): InnerContent => INNER[locale]
