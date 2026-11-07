import { getAuth } from "@/lib/auth"
import { chatEntitlementGate, createChatProxy } from "@/lib/chat-proxy"
import { loadEnv } from "@/lib/env"

export const POST = createChatProxy({
  csrf: (req) => getAuth().assertSameOrigin(req),
  // `Me`, not just the user: its saved locale (when chosen) is the language of every refusal, and
  // whether the user has two-step verification (or a passkey) feeds the gate below.
  requireUser: async (req) => {
    const me = await getAuth().getMeFromRequest(req)
    if (!me) return null
    return {
      id: me.user.id,
      locale: me.localeChosen ? me.user.locale : undefined,
      twoFactorSatisfied: me.user.twoFactorSatisfied,
    }
  },
  // The page shows an upsell (or the two-step notice), but the gate that counts is here: chat is
  // a paid feature, and a workspace requiring two-step verification refuses a member without it.
  authorize: chatEntitlementGate((req) => getAuth().resolveWorkspaceFromRequest(req)),
  env: () => loadEnv(["AI_SERVICE_URL", "AI_SERVICE_TOKEN"]),
})
