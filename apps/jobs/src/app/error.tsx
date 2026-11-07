"use client"

import { reportError } from "@repo/telemetry/browser"
import { StatusPage } from "@repo/ui/blocks/status-page"
import { Button } from "@repo/ui/components/button"
import { useEffect } from "react"

type ErrorPageProps = {
  error: Error & { digest?: string }
  reset: () => void
}

/** The segment error boundary. Also rendered by global-error.tsx inside its own <html>. */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") console.error(error)
    reportError(error, { kind: "boundary", digest: error.digest })
  }, [error])

  const reference = error.digest ? ` Reference: ${error.digest}` : ""
  return (
    <StatusPage
      code="500"
      title="Something went wrong"
      description={`An unexpected error occurred. Try again, or head back home.${reference}`}
    >
      <Button size="lg" onClick={reset}>
        Try again
      </Button>
      <Button asChild size="lg" variant="outline">
        {/* A plain anchor: global-error renders outside the router, where <Link> is unavailable. */}
        <a href="/">Back to home</a>
      </Button>
    </StatusPage>
  )
}
