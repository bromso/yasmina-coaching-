import type {
  LeadAudience,
  LeadContactMethod,
  LeadNeed,
  LeadNextStepKind,
  LeadTimeline,
} from "@repo/api-contract/leads"
import type { Locale } from "@repo/i18n/locales"

/**
 * Every word on `/kontakt` and `/kontakt/tack`, in Swedish and English: the hero, the three-step
 * contact form, the done page's tailored next step and "what happens now". Client-safe (types
 * only from the contract, nothing from `@repo/sites`), because the form reads its words in the
 * browser (`CONTACT[locale].form`): `stepOf` is a function, which cannot travel as a prop. Both
 * languages share one shape (`ContactCopy`), checked by `home.test.ts`.
 */

/** The contact page's own path, which every "contact" link on the site points at. */
export const CONTACT_HREF = "/kontakt"
/** Where the form lands after sending (`?ref=`, `?for=`, `?need=`, `?when=`). */
export const CONTACT_DONE_HREF = "/kontakt/tack"

export type ContactCopy = {
  meta: { title: string; description: string; doneTitle: string }
  hero: {
    eyebrow: string
    title: string
    lead: string
    /** One line on what happens after the visitor writes. */
    after: string
    /** The promised response time. */
    response: string
  }
  form: {
    /** The four steps, the last being the done page; each label is also its step's heading. */
    steps: readonly [string, string, string, string]
    stepOf: (n: number, total: number) => string
    stepper: { back: string; done: string }
    audience: {
      legend: string
      labels: Record<LeadAudience, string>
      hints: Record<LeadAudience, string>
    }
    need: { legend: string; labels: Record<LeadNeed, string> }
    timeline: { legend: string; labels: Record<LeadTimeline, string> }
    message: { label: string; hint: string }
    fields: {
      name: string
      email: string
      phone: string
      organisation: string
      role: string
      /** Shown above the organisation fields when every step shows at once (no JavaScript). */
      organisationOnly: string
    }
    contactMethod: { legend: string; labels: Record<LeadContactMethod, string> }
    consent: string
    newsletter: string
    /** Under the submit button: what the answers are used for and how long they are kept. */
    legal: string
    privacyLink: string
    continueLabel: string
    submit: string
    submitting: string
    /** The browser's own checks, and the server's field messages, in the page's language. */
    check: {
      audience: string
      need: string
      timeline: string
      message: string
      name: string
      email: string
      organisation: string
      phone: string
      consent: string
    }
  }
  done: {
    eyebrow: string
    title: string
    body: string
    reference: string
    /** The tailored next step, by kind (`leadNextStep`). */
    next: Record<LeadNextStepKind, { title: string; body: string; cta: string }>
    /** The explore step's reading list heading and its link to the inifrån hub. */
    readHeading: string
    inner: string
    whatNow: { heading: string; items: readonly [string, string, string] }
    home: string
  }
}

const sv: ContactCopy = {
  meta: {
    title: "Kontakt",
    description:
      "Berätta kort vem du är och vad du behöver, så hör Yasmina Petersson av sig inom två arbetsdagar.",
    doneTitle: "Tack för ditt meddelande",
  },
  hero: {
    eyebrow: "Kontakt",
    title: "Berätta var du står, så hör Yasmina av sig",
    lead: "Yasmina Petersson coachar chefer och ledningsgrupper inom socialtjänst, vård och skola. Tre korta steg räcker för att hon ska förstå vad du behöver.",
    after:
      "När du har skickat ser du direkt vad nästa steg är, och Yasmina läser varje meddelande själv.",
    response: "Du får svar inom två arbetsdagar.",
  },
  form: {
    steps: ["Vem skriver du för?", "Vad behöver du?", "Dina uppgifter", "Klart"],
    stepOf: (n, total) => `Steg ${n} av ${total}`,
    stepper: { back: "Tillbaka", done: "klart" },
    audience: {
      legend: "Vem skriver du för?",
      labels: { private: "Mig själv", organisation: "En organisation" },
      hints: {
        private: "Du söker stöd för din egen del.",
        organisation: "Du skriver för en arbetsplats, en enhet eller en ledningsgrupp.",
      },
    },
    need: {
      legend: "Vad vill du ha hjälp med?",
      labels: {
        coaching: "Ledarskapscoaching, en till en",
        inner_coaching: "Ledarskap inifrån: coachning",
        inner_mentoring: "Ledarskap inifrån: mentorskap",
        inner_lifestyle: "Ledarskap inifrån: livsstilsförändring",
        team: "Teamutveckling eller handledning",
        talk: "Workshop, föreläsning eller keynote",
        unsure: "Jag vet inte än",
      },
    },
    timeline: {
      legend: "Hur bråttom är det?",
      labels: {
        month: "Inom en månad",
        quarter: "Inom tre månader",
        exploring: "Jag tittar mest runt",
      },
    },
    message: {
      label: "Berätta kort om din situation (valfritt)",
      hint: "Några meningar räcker. Högst 2 000 tecken.",
    },
    fields: {
      name: "Namn",
      email: "E-post",
      phone: "Telefon (behövs om du vill bli uppringd)",
      organisation: "Organisation",
      role: "Din roll (valfritt)",
      organisationOnly: "Fyll i om du skriver för en organisation",
    },
    contactMethod: {
      legend: "Hur vill du helst bli kontaktad?",
      labels: { email: "Via e-post", phone: "Via telefon" },
    },
    consent: "Yasmina får kontakta mig om det här ärendet.",
    newsletter: "Jag vill gärna få nyhetsbrev från Yasmina då och då.",
    legal:
      "Dina svar används bara för att besvara ditt meddelande och sparas i tolv månader. Läs mer i",
    privacyLink: "integritetspolicyn",
    continueLabel: "Fortsätt",
    submit: "Skicka",
    submitting: "Skickar …",
    check: {
      audience: "Välj vem du skriver för.",
      need: "Välj vad du vill ha hjälp med.",
      timeline: "Välj hur bråttom det är.",
      message: "Meddelandet får vara högst 2 000 tecken.",
      name: "Skriv ditt namn.",
      email: "Skriv en e-postadress som fungerar, till exempel du@exempel.se.",
      organisation: "Skriv vilken organisation du skriver för.",
      phone: "Skriv ett telefonnummer, eller välj e-post.",
      consent: "Kryssa i rutan så att Yasmina kan svara dig.",
    },
  },
  done: {
    eyebrow: "Meddelandet är skickat",
    title: "Tack, nu vet Yasmina var du står",
    body: "En bekräftelse är på väg till din e-post. Du får svar inom två arbetsdagar.",
    reference: "Ditt referensnummer",
    next: {
      inner: {
        title: "Nästa steg: ett startsamtal",
        body: "Startsamtalet är där ni lär känna varandra och lägger upp arbetet. Vill du komma igång redan nu kan du välja en tid i kalendern.",
        cta: "Boka ett startsamtal",
      },
      coaching: {
        title: "Nästa steg: ett kostnadsfritt introsamtal",
        body: "Yasmina hör av sig för att boka trettio minuter i telefon, utan kostnad. Vill du hellre välja en tid själv kan du boka ett samtal direkt.",
        cta: "Boka ett samtal",
      },
      proposal: {
        title: "Nästa steg: ett förslag från Yasmina",
        body: "Yasmina återkommer med ett förslag på upplägg och pris. Har du redan datum i tankarna kan du skicka dem med förfrågan nedan.",
        cta: "Föreslå datum",
      },
      explore: {
        title: "Nästa steg: läs i lugn och ro",
        body: "Det är ingen brådska. Under tiden kan du läsa två texter som många börjar med, och se hur Ledarskap inifrån går till.",
        cta: "Läs om Ledarskap inifrån",
      },
    },
    readHeading: "Att läsa under tiden",
    inner: "Ledarskap inifrån",
    whatNow: {
      heading: "Vad händer nu",
      items: [
        "Yasmina läser ditt meddelande och tänker igenom vad som passar dig.",
        "Inom två arbetsdagar hör hon av sig, på det sätt du valde.",
        "Ni bestämmer tillsammans om och hur ni ska arbeta vidare.",
      ],
    },
    home: "Till startsidan",
  },
}

const en: ContactCopy = {
  meta: {
    title: "Contact",
    description:
      "Tell Yasmina Petersson briefly who you are and what you need, and she will be in touch within two working days.",
    doneTitle: "Thank you for your message",
  },
  hero: {
    eyebrow: "Contact",
    title: "Tell Yasmina where you stand, and she will be in touch",
    lead: "Yasmina Petersson coaches managers and leadership teams in social services, healthcare and schools. Three short steps are enough for her to understand what you need.",
    after:
      "Once you have sent it, you see your next step straight away, and Yasmina reads every message herself.",
    response: "You'll hear back within two working days.",
  },
  form: {
    steps: ["Who are you writing for?", "What do you need?", "Your details", "Done"],
    stepOf: (n, total) => `Step ${n} of ${total}`,
    stepper: { back: "Back", done: "done" },
    audience: {
      legend: "Who are you writing for?",
      labels: { private: "Myself", organisation: "An organisation" },
      hints: {
        private: "You are looking for support for your own part.",
        organisation: "You are writing for a workplace, a unit or a leadership team.",
      },
    },
    need: {
      legend: "What would you like help with?",
      labels: {
        coaching: "Leadership coaching, one to one",
        inner_coaching: "Ledarskap inifrån: coaching",
        inner_mentoring: "Ledarskap inifrån: mentoring",
        inner_lifestyle: "Ledarskap inifrån: lifestyle change",
        team: "Team development or supervision",
        talk: "A workshop, talk or keynote",
        unsure: "I don't know yet",
      },
    },
    timeline: {
      legend: "How soon?",
      labels: {
        month: "Within a month",
        quarter: "Within three months",
        exploring: "I'm mostly looking around",
      },
    },
    message: {
      label: "Briefly, what is your situation? (optional)",
      hint: "A few sentences are enough. At most 2,000 characters.",
    },
    fields: {
      name: "Name",
      email: "Email",
      phone: "Phone (needed if you would like a call)",
      organisation: "Organisation",
      role: "Your role (optional)",
      organisationOnly: "Fill in if you are writing for an organisation",
    },
    contactMethod: {
      legend: "How would you rather be contacted?",
      labels: { email: "By email", phone: "By phone" },
    },
    consent: "Yasmina may contact me about this request.",
    newsletter: "I would like to receive Yasmina's newsletter now and then.",
    legal:
      "Your answers are used only to reply to your message and are kept for twelve months. Read more in the",
    privacyLink: "privacy policy",
    continueLabel: "Continue",
    submit: "Send",
    submitting: "Sending …",
    check: {
      audience: "Choose who you are writing for.",
      need: "Choose what you would like help with.",
      timeline: "Choose how soon.",
      message: "The message can be at most 2,000 characters.",
      name: "Write your name.",
      email: "Write an email address that works, for example you@example.com.",
      organisation: "Write which organisation you are writing for.",
      phone: "Write a phone number, or choose email.",
      consent: "Tick the box so that Yasmina can reply to you.",
    },
  },
  done: {
    eyebrow: "Your message is sent",
    title: "Thank you, now Yasmina knows where you stand",
    body: "A confirmation is on its way to your email. You'll hear back within two working days.",
    reference: "Your reference",
    next: {
      inner: {
        title: "Next step: a start call",
        body: "The start call is where you get to know each other and plan the work. If you would like to start now, you can pick a time in the calendar.",
        cta: "Book a start call",
      },
      coaching: {
        title: "Next step: a free intro call",
        body: "Yasmina will get in touch to set up thirty minutes by phone, free of charge. If you would rather pick a time yourself, you can book a session directly.",
        cta: "Book a session",
      },
      proposal: {
        title: "Next step: a proposal from Yasmina",
        body: "Yasmina will come back to you with a proposal for format and price. If you already have dates in mind, you can send them with the request below.",
        cta: "Suggest dates",
      },
      explore: {
        title: "Next step: read at your own pace",
        body: "There is no hurry. In the meantime, here are two pieces many people start with, and how Ledarskap inifrån works.",
        cta: "Read about Ledarskap inifrån",
      },
    },
    readHeading: "To read in the meantime",
    inner: "Ledarskap inifrån",
    whatNow: {
      heading: "What happens now",
      items: [
        "Yasmina reads your message and thinks through what would suit you.",
        "Within two working days she gets in touch, the way you chose.",
        "Together you decide whether and how to work on.",
      ],
    },
    home: "Back to the home page",
  },
}

/** Both languages, one shape. */
export const CONTACT: Record<Locale, ContactCopy> = { sv, en }

export const contactFor = (locale: Locale): ContactCopy => CONTACT[locale]

/**
 * The explore step's two blog posts per language (slugs under `apps/blog/content/posts/`, checked
 * by `contact.test.ts`); the view builds each link from the blog's own URL.
 */
export const EXPLORE_POSTS: Record<Locale, readonly { slug: string; title: string }[]> = {
  sv: [
    { slug: "mentor-eller-coach", title: "Mentor eller coach?" },
    {
      slug: "vad-forskningen-sager-om-coachning",
      title: "Vad forskningen säger om coachning, och var den slutar",
    },
  ],
  en: [
    { slug: "en-mentor-or-coach", title: "Mentor or coach?" },
    {
      slug: "en-what-research-says-about-coaching",
      title: "What research says about coaching, and where it stops",
    },
  ],
}
