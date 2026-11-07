"use client"

import { Button } from "@repo/ui/components/button"
import { notifyConsentChanged } from "@repo/ui/components/use-consent"
import { type Consent, consentCookie, parseConsent } from "@repo/ui/lib/consent"
import { useEffect, useState } from "react"

export type CookieConsentLabels = {
  /** The region's accessible name. */
  region: string
  text: string
  privacy: string
  acceptAll: string
  necessaryOnly: string
}

const ENGLISH: CookieConsentLabels = {
  region: "Cookie consent",
  text: "We use cookies for sign-in and, if you allow it, to understand how the site is used.",
  privacy: "Privacy",
  acceptAll: "Accept all",
  necessaryOnly: "Necessary only",
}

export function CookieConsent({
  domain,
  privacyHref,
  initial,
  labels = ENGLISH,
}: {
  domain?: string
  privacyHref: string
  initial?: Consent | null
  /** The banner's text, in the page's language; English by default. */
  labels?: CookieConsentLabels
}) {
  const [choice, setChoice] = useState<Consent | null | undefined>(initial)

  useEffect(() => {
    if (initial === undefined) setChoice(parseConsent(document.cookie))
  }, [initial])

  if (choice !== null) return null // undefined = not yet read on the client; null = no choice

  const decide = (value: Consent) => {
    document.cookie = consentCookie(value, { domain, secure: location.protocol === "https:" })
    setChoice(value)
    notifyConsentChanged()
  }

  return (
    // <section> with an accessible name is implicitly role="region" (ARIA); the explicit
    // role is omitted because Biome's noRedundantRoles flags it as a lint error.
    <section
      aria-label={labels.region}
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background p-4 shadow-lg motion-safe:animate-in motion-safe:slide-in-from-bottom"
    >
      <div className="container flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">
          {labels.text}{" "}
          <a href={privacyHref} className="underline underline-offset-4">
            {labels.privacy}
          </a>
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => decide("all")}>
            {labels.acceptAll}
          </Button>
          <Button size="sm" variant="outline" onClick={() => decide("necessary")}>
            {labels.necessaryOnly}
          </Button>
        </div>
      </div>
    </section>
  )
}
