import { roleAtLeast } from "@repo/api-contract"
import { blockedByTwoFactor } from "@repo/session"
import { siteUrl } from "@repo/sites"
import type { Metadata } from "next"
import { connection } from "next/server"
import { getLocale, getTranslations } from "next-intl/server"
import { activityParams, readActivity } from "@/lib/activity"
import { apiKeysGate, listsApiKeys } from "@/lib/api-keys"
import { getAuth } from "@/lib/auth"
import { twoFactorRequiredProps } from "@/lib/two-factor-required"
import { deliveriesByEndpoint, listsWebhooks, webhooksGate } from "@/lib/webhooks"
import { TwoFactorRequiredView } from "@/views/two-factor-required-view"
import { WorkspaceView } from "@/views/workspace-view"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account.meta"))("workspace") }
}

type Search = Promise<Record<string, string | string[] | undefined>>

export default async function Page({ searchParams }: { searchParams: Search }) {
  await connection()
  // The Activity card's filter and page (`?activityAction=…&activityCursor=…`); anything the api
  // would refuse is dropped here, so a hand-edited URL shows the first page of everything.
  const activity = activityParams(await searchParams)
  const auth = getAuth()
  const { user, workspace, role, entitlements } = await auth.requireWorkspace()
  // A workspace requiring two-step verification refuses every read below to a member without it:
  // the notice instead, before any workspace call (never a redirect, so never a loop).
  if (blockedByTwoFactor(workspace, user)) {
    return <TwoFactorRequiredView {...(await twoFactorRequiredProps(workspace))} />
  }
  const api = await auth.api()
  const me = await auth.getMe()
  const workspaceId = workspace.id
  const isAdmin = roleAtLeast(role, "admin")
  // The api keys list needs the admin role (the procedure refuses below it) and is fetched on
  // every plan — a downgraded workspace's keys stay listed and revocable; only creating needs the
  // `api` feature. `workspace-view.tsx` decides what to render from the same `apiKeysGate`.
  const fetchApiKeys = listsApiKeys(apiKeysGate(role, entitlements))
  // Same rule for webhook endpoints: listed, their deliveries readable, and deletable on every
  // plan; creating, editing, enabling/disabling, rotating the secret and sending a test event all
  // need the `api` feature — `WebhooksCard` hides those controls per row below `manage`.
  const fetchWebhooks = listsWebhooks(webhooksGate(role, entitlements))
  const [{ items: members }, invitations, apiKeys, webhooks, activityPage, security] =
    await Promise.all([
      api.workspaces.members.list({ workspaceId }),
      // Pending invitations are an admin's business; below admin the api would refuse them anyway.
      isAdmin ? api.workspaces.invitations.list({ workspaceId }) : undefined,
      fetchApiKeys ? api.workspaces.apiKeys.list({ workspaceId }) : undefined,
      fetchWebhooks ? api.workspaces.webhooks.list({ workspaceId }) : undefined,
      // The activity log is an admin's too, on every plan; below admin the card is absent and the
      // procedure is never called. A failed read is the card's own "couldn't load" note.
      isAdmin
        ? readActivity(() => api.workspaces.activity.list({ workspaceId, ...activity }))
        : undefined,
      // The two-step requirement and how many members lack it: admins and up only (the api refuses
      // it below admin, and the Security card shows a viewer only the summary's own setting).
      isAdmin ? api.workspaces.security.get({ workspaceId }) : undefined,
    ])
  // Each endpoint's recent deliveries, pre-fetched so the card's disclosure works without
  // JavaScript (at most MAX_WEBHOOK_ENDPOINTS reads, bounded by the api's own cap).
  // One that vanished in between (another admin deleted it) reads as none, not a failed page.
  const deliveries = webhooks
    ? await deliveriesByEndpoint(webhooks.items, (id) =>
        api.workspaces.webhooks.deliveries({ workspaceId, id })
      )
    : undefined
  // Computed here, server-side, and passed down as a plain string: `ApiKeysCard` and
  // `WebhooksCard` are Client Components, and the client-imports guard refuses `@repo/sites` in
  // one of those (it reads `process.env` at call time, which never reaches the browser bundle).
  const docsUrl = siteUrl("docs")
  return (
    <WorkspaceView
      workspace={workspace}
      role={role}
      entitlements={entitlements}
      currentUserId={user.id}
      members={members}
      invitations={invitations?.items}
      apiKeys={apiKeys?.items}
      webhooks={webhooks?.items}
      deliveriesByEndpoint={deliveries}
      activity={activityPage === undefined ? undefined : { page: activityPage, params: activity }}
      security={security}
      isImpersonating={me?.impersonation != null}
      locale={await getLocale()}
      apiKeysDocsUrl={`${docsUrl}/developers/authentication`}
      webhooksDocsUrl={`${docsUrl}/developers/webhooks`}
    />
  )
}
