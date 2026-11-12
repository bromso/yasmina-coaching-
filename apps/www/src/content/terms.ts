import type { Locale } from "@repo/i18n/locales"
import type { LegalDoc } from "@/content/legal-notice"

/**
 * Template terms, in Swedish (the site's default) and English, with the same sections and
 * placeholders. Replace every `[Placeholder]` in both and have counsel review them before
 * publishing.
 */
const en: LegalDoc = {
  title: "Terms of service",
  metaTitle: "Terms",
  updatedAt: "2026-11-11",
  sections: [
    {
      id: "acceptance",
      title: "Acceptance",
      paragraphs: [
        "These terms govern your use of the services operated by [Company]. By creating an account or using the services you agree to them.",
        "If you use the services on behalf of an organisation, you accept these terms for that organisation.",
      ],
    },
    {
      id: "accounts",
      title: "Accounts",
      paragraphs: [
        "You are responsible for keeping your sign-in details secure and for everything done with your account.",
        "Tell us at [Contact email] straight away if you believe your account has been used without your permission.",
      ],
    },
    {
      id: "acceptable-use",
      title: "Acceptable use",
      paragraphs: [
        "Do not use the services to break the law, infringe others' rights, send spam, or interfere with the services or other users.",
        "We may suspend access that puts the services or other users at risk.",
      ],
    },
    {
      id: "content",
      title: "Content",
      paragraphs: [
        "You keep ownership of the content you submit. You grant [Company] the licence needed to host and display it in order to run the services.",
        "You are responsible for having the rights to the content you submit.",
      ],
    },
    {
      id: "termination",
      title: "Termination",
      paragraphs: [
        "You may stop using the services and delete your account at any time.",
        "We may suspend or end your access if you breach these terms, with notice where reasonable.",
      ],
    },
    {
      id: "liability",
      title: "Liability",
      paragraphs: [
        "The services are provided as is. To the extent the law of [Jurisdiction] allows, [Company] is not liable for indirect or consequential losses.",
        "Nothing in these terms limits liability that cannot be limited by law.",
      ],
    },
    {
      id: "changes",
      title: "Changes",
      paragraphs: [
        "We may update these terms. We will change the date above and, for material changes, notify you before they take effect.",
      ],
    },
    {
      id: "contact",
      title: "Contact",
      paragraphs: [
        "Questions about these terms: [Contact email]. These terms are governed by the law of [Jurisdiction].",
      ],
    },
  ],
}

const sv: LegalDoc = {
  title: "Användarvillkor",
  metaTitle: "Villkor",
  updatedAt: "2026-11-11",
  sections: [
    {
      id: "acceptance",
      title: "Godkännande",
      paragraphs: [
        "De här villkoren gäller när du använder de tjänster som [Company] driver. Genom att skapa ett konto eller använda tjänsterna godkänner du dem.",
        "Om du använder tjänsterna för en organisations räkning godkänner du villkoren för den organisationen.",
      ],
    },
    {
      id: "accounts",
      title: "Konton",
      paragraphs: [
        "Du ansvarar för att hålla dina inloggningsuppgifter säkra och för allt som görs med ditt konto.",
        "Meddela oss genast på [Contact email] om du tror att någon har använt ditt konto utan ditt tillstånd.",
      ],
    },
    {
      id: "acceptable-use",
      title: "Tillåten användning",
      paragraphs: [
        "Använd inte tjänsterna för att bryta mot lagen, göra intrång i andras rättigheter, skicka skräppost eller störa tjänsterna eller andra användare.",
        "Vi kan stänga av åtkomst som utsätter tjänsterna eller andra användare för risk.",
      ],
    },
    {
      id: "content",
      title: "Innehåll",
      paragraphs: [
        "Du behåller äganderätten till det innehåll du lämnar. Du ger [Company] den licens som behövs för att lagra och visa det för att kunna driva tjänsterna.",
        "Du ansvarar för att du har rätt till det innehåll du lämnar.",
      ],
    },
    {
      id: "termination",
      title: "Uppsägning",
      paragraphs: [
        "Du kan när som helst sluta använda tjänsterna och radera ditt konto.",
        "Vi kan stänga av eller avsluta din åtkomst om du bryter mot villkoren, med förvarning när det är rimligt.",
      ],
    },
    {
      id: "liability",
      title: "Ansvar",
      paragraphs: [
        "Tjänsterna tillhandahålls i befintligt skick. I den utsträckning lagen i [Jurisdiction] tillåter ansvarar [Company] inte för indirekta skador eller följdskador.",
        "Inget i de här villkoren begränsar ett ansvar som enligt lag inte kan begränsas.",
      ],
    },
    {
      id: "changes",
      title: "Ändringar",
      paragraphs: [
        "Vi kan uppdatera villkoren. Då ändrar vi datumet ovan, och vid väsentliga ändringar meddelar vi dig innan de börjar gälla.",
      ],
    },
    {
      id: "contact",
      title: "Kontakt",
      paragraphs: [
        "Frågor om villkoren: [Contact email]. Villkoren regleras av lagen i [Jurisdiction].",
      ],
    },
  ],
}

/** Both languages, one shape: the same section ids, in the same order. */
export const TERMS: Record<Locale, LegalDoc> = { sv, en }

export const termsFor = (locale: Locale): LegalDoc => TERMS[locale]

/** The English template, as earlier callers read it. */
export const terms = en
