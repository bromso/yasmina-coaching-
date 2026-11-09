"use client"

import { useEffect } from "react"

/**
 * Development only: removes any service worker (and its caches) left on this origin by an earlier
 * production run (`next start`, the e2e stack, Docker). `next dev` never registers one, so a
 * leftover worker would keep serving the old build's JavaScript and pages — a hydration mismatch
 * that no code change fixes. Renders nothing; in production it does nothing at all.
 */
export function DevServiceWorkerReset() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development" || !("serviceWorker" in navigator)) return
    void (async () => {
      const registrations = await navigator.serviceWorker.getRegistrations()
      if (registrations.length === 0) return
      await Promise.all(registrations.map((registration) => registration.unregister()))
      if ("caches" in window) {
        await Promise.all((await caches.keys()).map((key) => caches.delete(key)))
      }
      // The page itself may have come from the old cache: load it once more from the dev server.
      window.location.reload()
    })()
  }, [])
  return null
}
