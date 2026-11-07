import { AuthLayout } from "@/components/auth-layout"
import { EmailCancelForm } from "@/components/email-cancel-form"

export function EmailCancelView({ token }: { token: string }) {
  return (
    <AuthLayout>
      <EmailCancelForm token={token} />
    </AuthLayout>
  )
}
