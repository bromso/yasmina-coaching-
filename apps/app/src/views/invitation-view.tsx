import type { InvitationPreview } from "@repo/api-contract"
import { Button } from "@repo/ui/components/button"
import { useTranslations } from "next-intl"
import { signOut } from "@/app/actions"
import { AcceptInvitationButton } from "@/components/accept-invitation-button"

type InvitationViewProps = {
  preview: InvitationPreview
  /** Signed in or not; who exactly is the api's call when the invitation is accepted. */
  signedIn: boolean
  token: string
  authUrl: string
  /** This page's URL, the auth app's `next` target. */
  current: string
}

/** The invitation link's landing page. Rendering it never consumes the token; Accept does. */
export function InvitationView({
  preview,
  signedIn,
  token,
  authUrl,
  current,
}: InvitationViewProps) {
  const t = useTranslations("app")
  const next = encodeURIComponent(current)
  // The workspace's allowed invitation domains changed since this was sent: the api would refuse
  // the accept, so the page says so and offers no way to try (signing in included).
  const refused = preview.domainAllowed === false
  return (
    <main id="main" className="mx-auto grid w-full max-w-xl gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        {t("invitations.join", { workspace: preview.workspace.name })}
      </h1>
      <p>
        {t("invitations.summary", {
          inviter: preview.invitedBy.name || t("someone"),
          workspace: preview.workspace.name,
          role: t("role", { role: preview.role }),
        })}
      </p>
      {preview.requireTwoFactor && <p>{t("invitations.requiresTwoFactor")}</p>}
      {refused && <p className="font-medium">{t("invitations.domainNotAllowed")}</p>}
      {signedIn ? (
        <>
          {!refused && <AcceptInvitationButton token={token} />}
          <form action={signOut} className="text-muted-foreground flex items-center gap-1 text-sm">
            {t("invitations.notYou")}
            <Button type="submit" variant="link" size="sm" className="h-auto px-0">
              {t("invitations.signOut")}
            </Button>
          </form>
        </>
      ) : refused ? null : (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <a href={`${authUrl}/login?next=${next}`}>{t("invitations.signIn")}</a>
            </Button>
            <Button asChild variant="outline">
              <a href={`${authUrl}/signup?next=${next}`}>{t("invitations.createAccount")}</a>
            </Button>
          </div>
          <p className="text-muted-foreground text-sm">
            {t("invitations.useEmail", { email: preview.email })}
          </p>
        </div>
      )}
    </main>
  )
}
