import { createLogger } from "@repo/log"
import { assertSameOrigin } from "@repo/session"
import { auditExportResponse, auditExportUnavailable } from "@/lib/audit-export"
import { getAuth } from "@/lib/auth"

const logger = createLogger({ service: "auth" })

// Route handlers sit outside the React tree `admin/(gated)/layout.tsx` wraps, so that layout's
// superadmin check never runs for this route — same note as the CV route's. What actually gates
// it is `admin.audit.export` itself (`NOT_FOUND` for anyone who is not a live superadmin session),
// which `auditExportResponse` turns into the same 404 as a signed-out caller.
export async function POST(req: Request) {
  const csrf = assertSameOrigin(req)
  if (csrf) return csrf

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    form = new FormData()
  }

  try {
    const auth = getAuth()
    const user = await auth.getUser()
    const api = user ? (await auth.api()).admin.audit : null
    return await auditExportResponse(api ? (input) => api.export(input) : null, form)
  } catch (error) {
    // The session lookup itself failed (the api is down): a retryable outage, not a 404.
    logger.error("audit export failed", { error })
    return auditExportUnavailable(form)
  }
}
