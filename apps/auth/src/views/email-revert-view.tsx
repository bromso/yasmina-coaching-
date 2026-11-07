import { siteUrl } from "@repo/sites"
import { AuthLayout } from "@/components/auth-layout"
import { EmailRevertForm } from "@/components/email-revert-form"

/**
 * The account Security page's URL, computed server-side: `siteUrl` reads `process.env`, which is
 * not inlined into the browser bundle — the same reason `security-view.tsx` computes its own
 * `securityUrl` and passes it down to `ConnectedAccounts` as a plain string, rather than letting
 * the client component call `siteUrl` itself.
 */
export function emailRevertSecurityUrl(): string {
  return `${siteUrl("account")}/security`
}

export function EmailRevertView({ token }: { token: string }) {
  const securityUrl = emailRevertSecurityUrl()
  return (
    <AuthLayout>
      <EmailRevertForm token={token} securityUrl={securityUrl} />
    </AuthLayout>
  )
}
