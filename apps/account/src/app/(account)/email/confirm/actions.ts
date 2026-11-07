"use server"

import { revalidatePath } from "next/cache"
import { confirmEmailChangeCore, type EmailChangeConfirmState } from "@/lib/actions"
import { getAuth } from "@/lib/auth"

/**
 * The confirm page's one action: never called until the button is pressed, never on load. A
 * success replaces the account's address, which the shared layout and the Personal info page
 * both read, so the whole tree is revalidated like `setAvatar`'s does for the avatar.
 */
export async function confirmEmailChange(
  _prev: EmailChangeConfirmState,
  fd: FormData
): Promise<EmailChangeConfirmState> {
  const auth = getAuth()
  await auth.requireUser()
  const out = await confirmEmailChangeCore(
    { api: (await auth.api()).account, locale: await auth.getLocale() },
    fd
  )
  if (out.ok) revalidatePath("/", "layout")
  return out
}
