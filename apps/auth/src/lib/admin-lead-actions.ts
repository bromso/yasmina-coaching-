import type { ApiClient } from "@repo/api-contract"
import { isLeadStatus, LEAD_NOTES_MAX } from "@repo/api-contract/leads"
import { createLogger } from "@repo/log"
import { apiError, type FormState, str, UNAVAILABLE } from "@/lib/admin-actions"

const logger = createLogger({ service: "auth" })

export type LeadActionDeps = {
  api: { leads: Pick<ApiClient["admin"]["leads"], "update"> }
}
export type LeadDeleteDeps = {
  api: { leads: Pick<ApiClient["admin"]["leads"], "delete"> }
}

/** The delete form's own refusal when its confirm box is left unticked. */
export const DELETE_CONFIRM_REQUIRED = "Tick the box to confirm the lead should be deleted."

/**
 * Deletes a lead on request (before its 12 months are up). The form's second step is a required
 * "Yes, delete" checkbox, never a browser dialog; without it nothing is sent. Success is
 * `{ ok: true }`, and the action then leaves for `/admin/leads`.
 */
export async function deleteLeadCore(deps: LeadDeleteDeps, fd: FormData): Promise<FormState> {
  const id = Number(str(fd, "id"))
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Lead not found" }
  if (str(fd, "confirm") !== "yes") {
    return { ok: false, fieldErrors: { confirm: DELETE_CONFIRM_REQUIRED } }
  }
  try {
    await deps.api.leads.delete({ id })
    return { ok: true, message: "Lead deleted." }
  } catch (error) {
    const known = apiError(error, ["NOT_FOUND"])
    if (!known) logger.error("deleteLead failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE }
  }
}

/**
 * `/admin/leads/<id>`'s one form: the status and Yasmina's notes, saved together. The form also
 * posts `currentStatus`, the status it was rendered with: the status is sent only when the select
 * differs from it, so saving notes from a stale tab never puts back a status someone else has
 * since changed.
 */
export async function updateLeadCore(deps: LeadActionDeps, fd: FormData): Promise<FormState> {
  const id = Number(str(fd, "id"))
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Lead not found" }
  const status = str(fd, "status")
  const currentStatus = str(fd, "currentStatus")
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
    await deps.api.leads.update(status === currentStatus ? { id, notes } : { id, status, notes })
    return { ok: true, message: "Saved." }
  } catch (error) {
    const known = apiError(error, ["NOT_FOUND"])
    if (!known) logger.error("updateLead failed", { error })
    return { ok: false, message: known?.message ?? UNAVAILABLE, values }
  }
}
