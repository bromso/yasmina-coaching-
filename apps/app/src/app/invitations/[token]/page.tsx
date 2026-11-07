import { ORPCError } from "@orpc/client"
import type { InvitationPreview } from "@repo/api-contract"
import { createLogger } from "@repo/log"
import { requestInfo } from "@repo/session"
import { StatusPage } from "@repo/ui/blocks/status-page"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { connection } from "next/server"
import { getTranslations } from "next-intl/server"
import { getAuth } from "@/lib/auth"
import { loadEnv } from "@/lib/env"
import { InvitationView } from "@/views/invitation-view"

const logger = createLogger({ service: "app" })

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.meta")
  return { title: t("invitation") }
}

/**
 * Expected answers to a bad link, not worth a log line: NOT_FOUND (unknown, expired, used) and
 * BAD_REQUEST (a token that fails `InvitationTokenSchema`). oRPC's input-validation BAD_REQUEST is
 * not a declared error (`defined` is false), so it is matched by code alone.
 */
const quiet = (error: unknown) =>
  error instanceof ORPCError &&
  ((error.defined && error.code === "NOT_FOUND") || error.code === "BAD_REQUEST")

/** The preview, or null when the link is unknown, expired or used (or the api is unreachable). */
async function preview(token: string): Promise<InvitationPreview | null> {
  const auth = getAuth()
  try {
    const api = await auth.anonymousApi({ ip: requestInfo(await headers()).ip })
    return await api.invitations.preview({ token })
  } catch (error) {
    if (!quiet(error)) logger.error("invitations.preview failed", { error })
    return null
  }
}

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  await connection()
  const { token } = await params
  const invitation = await preview(token)
  if (!invitation) {
    const t = await getTranslations("app.invitations")
    return (
      <main id="main">
        <StatusPage code="404" title={t("invalid")} description={t("invalidDescription")} />
      </main>
    )
  }
  // No session required: signed out, the page offers sign-in and sign-up back to itself.
  const user = await getAuth().getUser()
  const { AUTH_URL, APP_URL } = loadEnv(["AUTH_URL", "APP_URL"])
  const current =
    (await headers()).get("x-url") ?? `${APP_URL}/invitations/${encodeURIComponent(token)}`
  return (
    <InvitationView
      preview={invitation}
      signedIn={user !== null}
      token={token}
      authUrl={AUTH_URL}
      current={current}
    />
  )
}
