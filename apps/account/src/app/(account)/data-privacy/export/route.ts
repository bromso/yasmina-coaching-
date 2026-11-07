import { getAuth } from "@/lib/auth"
import { exportDownloadResponse } from "@/lib/export-download"

/** The ready data export, downloaded as the signed-in user; `404` otherwise. */
export async function GET(req: Request) {
  const auth = getAuth()
  const user = await auth.getUser()
  const api = user ? (await auth.api()).account.export : null
  return exportDownloadResponse(
    api ? (input) => api.download(input) : null,
    new URL(req.url).searchParams.get("id")
  )
}
