"use server"

import { revalidatePath } from "next/cache"
import { notFound } from "next/navigation"
import { canUseAdmin } from "@/lib/admin"
import {
  deleteApplicationCore,
  type FormState,
  setApplicationStatusCore,
} from "@/lib/admin-actions"
import { getAuth } from "@/lib/auth"

/** The same gate as the pages: anyone else gets the 404 the pages give. */
async function requireAdmin() {
  const auth = getAuth()
  await auth.requireUser()
  if (!canUseAdmin(await auth.getMe())) notFound()
  return auth
}

export async function setApplicationStatus(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await requireAdmin()
  const out = await setApplicationStatusCore({ api: (await auth.api()).admin }, fd)
  if (out.ok) revalidatePath("/admin/applications")
  return out
}

export async function deleteApplication(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await requireAdmin()
  const out = await deleteApplicationCore({ api: (await auth.api()).admin }, fd)
  if (out.ok) revalidatePath("/admin/applications")
  return out
}
