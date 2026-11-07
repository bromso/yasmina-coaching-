import { Button } from "@repo/ui/components/button"
import { stopImpersonation } from "@/app/admin/stop/actions"

/** A plain server-action form: works without JS, posts same-origin. */
export function StopImpersonationForm() {
  return (
    <form action={stopImpersonation}>
      <Button type="submit" className="w-full">
        Stop impersonating
      </Button>
    </form>
  )
}
