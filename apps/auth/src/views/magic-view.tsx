import { AuthLayout } from "@/components/auth-layout"
import { MagicContinueForm } from "@/components/magic-continue-form"

export function MagicView({ token, next }: { token: string; next?: string }) {
  return (
    <AuthLayout>
      <MagicContinueForm token={token} next={next} />
    </AuthLayout>
  )
}
