import type { Me } from "@repo/api-contract"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { StopImpersonationForm } from "@/components/admin/stop-impersonation-form"
import { AuthLayout } from "@/components/auth-layout"
import { formatDateTime } from "@/lib/admin"

export type StopDetails = { name: string; impersonation: NonNullable<Me["impersonation"]> }

/** `details` is null when the sign-in service could not say who is being impersonated. */
export function AdminStopView({ details }: { details: StopDetails | null }) {
  return (
    <AuthLayout>
      <Card size="compact">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Impersonating</CardTitle>
          <CardDescription>
            {details ? (
              <>
                You are impersonating <strong>{details.name}</strong> (
                {details.impersonation.reason}, ends{" "}
                {formatDateTime(details.impersonation.expiresAt)})
              </>
            ) : (
              "You are impersonating someone; the sign-in service could not be reached."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StopImpersonationForm />
        </CardContent>
      </Card>
    </AuthLayout>
  )
}
