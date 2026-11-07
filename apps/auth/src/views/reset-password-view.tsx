import { AuthLayout } from "@/components/auth-layout"
import { ResetPasswordForm } from "@/components/reset-password-form"

export function ResetPasswordView({ token }: { token: string }) {
  return (
    <AuthLayout>
      <ResetPasswordForm token={token} />
    </AuthLayout>
  )
}
