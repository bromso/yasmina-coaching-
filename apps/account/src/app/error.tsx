"use client"

import { reportError } from "@repo/telemetry/browser"
import { StatusPage } from "@repo/ui/blocks/status-page"
import { Button } from "@repo/ui/components/button"
import { useTranslations } from "next-intl"
import { useEffect } from "react"
import { useIntlReady } from "@/components/intl-ready"

type ErrorPageProps = {
  error: Error & { digest?: string }
  reset: () => void
}

type Labels = {
  title: string
  description: string
  tryAgain: string
  backHome: string
  reference: (digest: string) => string
}

const ENGLISH: Labels = {
  title: "Something went wrong",
  description: "An unexpected error occurred. Try again, or head back home.",
  tryAgain: "Try again",
  backHome: "Back to home",
  reference: (digest) => `Reference: ${digest}`,
}

/**
 * The segment error boundary. Also rendered by global-error.tsx inside its own <html>, outside the
 * layout's translations: there it reads English.
 */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") console.error(error)
    reportError(error, { kind: "boundary", digest: error.digest })
  }, [error])

  return useIntlReady() ? (
    <TranslatedError error={error} reset={reset} />
  ) : (
    <ErrorContent error={error} reset={reset} labels={ENGLISH} />
  )
}

function TranslatedError(props: ErrorPageProps) {
  const t = useTranslations("account.status")
  const labels: Labels = {
    title: t("errorTitle"),
    description: t("errorDescription"),
    tryAgain: t("tryAgain"),
    backHome: t("backHome"),
    reference: (digest) => t("errorReference", { digest }),
  }
  return <ErrorContent {...props} labels={labels} />
}

function ErrorContent({ error, reset, labels }: ErrorPageProps & { labels: Labels }) {
  const reference = error.digest ? ` ${labels.reference(error.digest)}` : ""
  return (
    <StatusPage code="500" title={labels.title} description={`${labels.description}${reference}`}>
      <Button size="lg" onClick={reset}>
        {labels.tryAgain}
      </Button>
      <Button asChild size="lg" variant="outline">
        {/* A plain anchor: global-error renders outside the router, where <Link> is unavailable. */}
        <a href="/">{labels.backHome}</a>
      </Button>
    </StatusPage>
  )
}
