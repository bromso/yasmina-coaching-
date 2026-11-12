"use server"

import { revalidatePath } from "next/cache"
import { notFound, redirect } from "next/navigation"
import { canUseAdmin } from "@/lib/admin"
import type { FormState } from "@/lib/admin-actions"
import { deleteLeadCore, updateLeadCore } from "@/lib/admin-lead-actions"
import { getAuth } from "@/lib/auth"

/** The same gate as the pages: anyone else gets the 404 the pages give. */
async function requireAdmin() {
  const auth = getAuth()
  await auth.requireUser()
  if (!canUseAdmin(await auth.getMe())) notFound()
  return auth
}

export async function updateLead(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await requireAdmin()
  const out = await updateLeadCore({ api: (await auth.api()).admin }, fd)
  if (out.ok) revalidatePath("/admin/leads", "layout")
  return out
}

/** Deletes a lead on request; success leaves for the list, whose counts no longer include it. */
export async function deleteLead(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await requireAdmin()
  const out = await deleteLeadCore({ api: (await auth.api()).admin }, fd)
  if (!out.ok) return out
  revalidatePath("/admin/leads", "layout")
  redirect("/admin/leads?deleted=1")
}
