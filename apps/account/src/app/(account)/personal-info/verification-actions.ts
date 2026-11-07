"use server"

import { type FormState, resendVerificationCore } from "@/lib/actions"
import { getAuth } from "@/lib/auth"

export async function resendVerification(_prev: FormState): Promise<FormState> {
  const auth = getAuth()
  await auth.requireUser()
  return resendVerificationCore({
    api: (await auth.api()).account,
    locale: await auth.getLocale(),
  })
}
