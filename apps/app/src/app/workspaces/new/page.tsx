import type { Metadata } from "next"
import { connection } from "next/server"
import { getLocale, getTranslations } from "next-intl/server"
import { getAuth } from "@/lib/auth"
import { WorkspaceNewView } from "@/views/workspace-new-view"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.meta")
  return { title: t("workspaceNew") }
}

export default async function Page() {
  await connection()
  // requireUser, not requireWorkspace: that one redirects here when there is no workspace.
  const auth = getAuth()
  const user = await auth.requireUser()
  const list = await auth.listWorkspaces()
  return <WorkspaceNewView user={user} list={list} locale={await getLocale()} />
}
