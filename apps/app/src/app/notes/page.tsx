import { createLogger } from "@repo/log"
import { blockedByTwoFactor } from "@repo/session"
import type { Metadata } from "next"
import { headers } from "next/headers"
import { connection } from "next/server"
import { getLocale, getTranslations } from "next-intl/server"
import { api, describeApiError } from "@/lib/api"
import { getAuth } from "@/lib/auth"
import { loadEnv } from "@/lib/env"
import { parseCursor } from "@/lib/pagination"
import { twoFactorRequiredProps } from "@/lib/two-factor-required"
import { NotesView } from "@/views/notes-view"
import { TwoFactorRequiredView } from "@/views/two-factor-required-view"

const logger = createLogger({ service: "app" })

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.meta")
  return { title: t("notes") }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Live data on every request — and it keeps `next build`, which has no API to call, from
  // trying to prerender this page.
  await connection()
  // Notes belong to a workspace: signed out, this redirects to sign-in and back (via `x-url`);
  // with no workspace, to creating one.
  const { user, workspace, role } = await getAuth().requireWorkspace()
  // A workspace requiring two-step verification refuses `notes.list` to a member without it: the
  // notice instead, before any workspace call (never a redirect, so never a loop).
  if (blockedByTwoFactor(workspace, user)) {
    return <TwoFactorRequiredView {...(await twoFactorRequiredProps(workspace))} />
  }
  const locale = await getLocale()
  const viewer = { workspace, role, userId: user.id, locale }
  const cursor = parseCursor((await searchParams).cursor)
  // Live notes only ever prepend to the first page — an older page never gains a note it never had.
  const firstPage = cursor === undefined
  // When this list was rendered: the live client skips its first resync only if it is this fresh.
  const renderedAt = Date.now()
  // The same sign-in link the header's own `SignInLink` carries, for `LiveNotes` to show once a
  // 401 ends its stream for good: `AUTH_URL` and the current URL (`x-url`, set by the shared
  // security proxy), falling back to `APP_URL` + this route when the header is missing.
  const { AUTH_URL, APP_URL } = loadEnv(["AUTH_URL", "APP_URL"])
  const signInNext = (await headers()).get("x-url") ?? `${APP_URL}/notes`
  try {
    const page = await (await api()).notes.list({ workspaceId: workspace.id, cursor })
    return (
      <NotesView
        {...viewer}
        firstPage={firstPage}
        renderedAt={renderedAt}
        authUrl={AUTH_URL}
        signInNext={signInNext}
        page={page}
        cursor={cursor}
      />
    )
  } catch (error) {
    logger.error("notes.list failed", { error })
    return (
      <NotesView
        {...viewer}
        firstPage={firstPage}
        renderedAt={renderedAt}
        authUrl={AUTH_URL}
        signInNext={signInNext}
        error={describeApiError(error, { locale })}
      />
    )
  }
}
