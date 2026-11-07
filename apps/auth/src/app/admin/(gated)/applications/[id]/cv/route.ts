import { createLogger } from "@repo/log"
import { getAuth } from "@/lib/auth"
import { cvDownloadResponse } from "@/lib/cv-download"

const logger = createLogger({ service: "auth" })

// Route handlers sit outside the React tree `admin/(gated)/layout.tsx` wraps, so that layout's
// superadmin check never runs for this route. What actually gates it is `admin.applications.cv`
// itself (NOT_FOUND for anyone who is not a live superadmin session), which `cvDownloadResponse`
// turns into the same 404 as a missing application or a missing CV object.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const auth = getAuth()
    const user = await auth.getUser()
    const api = user ? (await auth.api()).admin.applications : null
    return cvDownloadResponse(api ? (input) => api.cv(input) : null, id)
  } catch (error) {
    logger.error("cv download failed", { error })
    return cvDownloadResponse(null, id)
  }
}
