import type { LegalSection } from "@repo/ui/blocks/legal-page"

/** Template terms. Replace every `[Placeholder]` and have counsel review before publishing. */
export const terms: { updatedAt: string; sections: LegalSection[] } = {
  updatedAt: "2026-10-02",
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
