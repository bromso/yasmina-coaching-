import { AuthLayout } from "@/components/auth-layout"
import { ForgotPasswordForm } from "@/components/forgot-password-form"

export function ForgotPasswordView() {
  return (
    <AuthLayout>
      <ForgotPasswordForm />
    </AuthLayout>
  )
}
