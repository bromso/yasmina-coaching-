import type { ApiClient } from "@repo/api-contract"
import { isLeadStatus, LEAD_NOTES_MAX } from "@repo/api-contract/leads"
import { createLogger } from "@repo/log"
import { apiError, type FormState, str, UNAVAILABLE } from "@/lib/admin-actions"

const logger = createLogger({ service: "auth" })

export type LeadActionDeps = {
  api: { leads: Pick<ApiClient["admin"]["leads"], "update"> }
}

/** `/admin/leads/<id>`'s one form: the status and Yasmina's notes, saved together. */
export async function updateLeadCore(deps: LeadActionDeps, fd: FormData): Promise<FormState> {
  const id = Number(str(fd, "id"))
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Lead not found" }
  const status = str(fd, "status")
  const notes = str(fd, "notes")
  const values = { status, notes }
  if (!isLeadStatus(status)) return { ok: false, message: "Not a valid status", values }
  if (notes.trim().length > LEAD_NOTES_MAX) {
    return {
      ok: false,
      fieldErrors: { notes: `Notes can be at most ${LEAD_NOTES_MAX} characters.` },
      values,
    }
  }
  try {
    await deps.api.leads.update({ id, status, notes })
    return { ok: true, message: "Saved." }
  } catch (error) {
    const known = apiError(error, ["NOT_FOUND"])
    if (!known) logger.error("updateLead failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE, values }
  }
}
