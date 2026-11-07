"use client"

import { type Consent, parseConsent } from "@repo/ui/lib/consent"
import { useSyncExternalStore } from "react"

const consentChanged = new EventTarget()

/** Dispatched by the banner right after it writes the consent cookie. */
export function notifyConsentChanged() {
  consentChanged.dispatchEvent(new Event("change"))
}

function subscribe(callback: () => void) {
  consentChanged.addEventListener("change", callback)
  return () => consentChanged.removeEventListener("change", callback)
}

function getSnapshot(): Consent | null {
  return parseConsent(document.cookie)
}

function getServerSnapshot(): Consent | null {
  return null
}

/** The current consent choice, re-read whenever the banner writes a new one. */
export function useConsent(): Consent | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
