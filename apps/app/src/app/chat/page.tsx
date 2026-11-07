import { blockedByTwoFactor, hasFeature } from "@repo/session"
import { siteUrl } from "@repo/sites"
import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { getAuth } from "@/lib/auth"
import { twoFactorRequiredProps } from "@/lib/two-factor-required"
import { ChatUpsellView } from "@/views/chat-upsell-view"
import { ChatView } from "@/views/chat-view"
import { TwoFactorRequiredView } from "@/views/two-factor-required-view"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app.meta")
  return { title: t("chat") }
}

export default async function Page() {
  // /api/chat answers 401 without a session; send the visitor to sign in instead of a dead chat,
  // and one without a workspace to creating one, as /notes does. A workspace whose plan lacks
  // chat sees the upsell (the proxy refuses it with a 403 regardless). A workspace requiring
  // two-step verification of a member without it shows the notice first (the proxy refuses that
  // with a 403 too), since no upgrade would help.
  const { user, workspace, entitlements } = await getAuth().requireWorkspace()
  if (blockedByTwoFactor(workspace, user)) {
    return <TwoFactorRequiredView {...(await twoFactorRequiredProps(workspace))} />
  }
  return hasFeature(entitlements, "chat") ? (
    <ChatView />
  ) : (
    <ChatUpsellView plansUrl={`${siteUrl("account")}/payments`} />
  )
}
