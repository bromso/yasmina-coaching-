"use client"

import { reportError } from "@repo/telemetry/browser"
import { StatusPage } from "@repo/ui/blocks/status-page"
import { Button } from "@repo/ui/components/button"
import { useEffect, useSyncExternalStore } from "react"
import { STATUS } from "@/content/status"

type ErrorPageProps = {
  error: Error & { digest?: string }
  reset: () => void
}

const subscribeNever = () => () => {}
/** The page's language, from the `<html lang>` the layout rendered (`sv` under global-error.tsx). */
const htmlLocale = () => (document.documentElement.lang === "en" ? "en" : "sv")

/** The segment error boundary. Also rendered by global-error.tsx inside its own <html>. */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  const locale = useSyncExternalStore(subscribeNever, htmlLocale, () => "sv" as const)
  const copy = STATUS[locale]

  useEffect(() => {
    if (process.env.NODE_ENV === "development") console.error(error)
    reportError(error, { kind: "boundary", digest: error.digest })
  }, [error])

  const reference = error.digest ? ` ${copy.error.reference} ${error.digest}` : ""
  return (
    <StatusPage
      code="500"
      title={copy.error.title}
      description={`${copy.error.description}${reference}`}
    >
      <Button size="lg" onClick={reset}>
        {copy.error.retry}
      </Button>
      <Button asChild size="lg" variant="outline">
        {/* A plain anchor: global-error renders outside the router, where <Link> is unavailable. */}
        <a href="/">{copy.home}</a>
      </Button>
    </StatusPage>
  )
}
