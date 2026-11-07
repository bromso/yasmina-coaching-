import { AuthLayout } from "@/components/auth-layout"
import { TwoFactorForm } from "@/components/two-factor-form"

export function VerifyView({ next, recovery }: { next?: string; recovery: boolean }) {
  return (
    <AuthLayout>
      <TwoFactorForm next={next} recovery={recovery} />
    </AuthLayout>
  )
}
