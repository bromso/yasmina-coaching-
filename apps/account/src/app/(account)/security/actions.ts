"use server"

import { revalidatePath } from "next/cache"
import {
  changePasswordCore,
  deletePasskeyCore,
  disableTwoFactorCore,
  disconnectIdentityCore,
  enableTwoFactorCore,
  type FormState,
  type PasskeyRegisterOptionsState,
  type PasskeyRegisterState,
  passkeyRegisterCore,
  passkeyRegisterOptionsCore,
  regenerateRecoveryCodesCore,
  renamePasskeyCore,
  revokeOtherSessionsCore,
  revokeSessionCore,
  type SetPasswordState,
  setPasswordCore,
  setupTwoFactorCore,
  type TwoFactorEnableState,
  type TwoFactorRegenerateState,
  type TwoFactorSetupState,
} from "@/lib/actions"
import { getAuth } from "@/lib/auth"
import { reauthHref } from "@/lib/reauth"

/**
 * Every action re-checks the session first (a server action is a public endpoint of its own), then
 * answers in the request's language.
 */
async function accountApi() {
  const auth = getAuth()
  await auth.requireUser()
  return { api: (await auth.api()).account, locale: await auth.getLocale() }
}

function revalidateOnSuccess(out: FormState) {
  if (out.ok) revalidatePath("/security")
  return out
}

export async function changePassword(_prev: FormState, fd: FormData): Promise<FormState> {
  return revalidateOnSuccess(await changePasswordCore(await accountApi(), fd))
}

export async function revokeSession(_prev: FormState, fd: FormData): Promise<FormState> {
  return revalidateOnSuccess(await revokeSessionCore(await accountApi(), fd))
}

export async function revokeOtherSessions(_prev: FormState, _fd: FormData): Promise<FormState> {
  return revalidateOnSuccess(await revokeOtherSessionsCore(await accountApi()))
}

export async function setPassword(
  _prev: SetPasswordState,
  fd: FormData
): Promise<SetPasswordState> {
  const out = await setPasswordCore(
    { ...(await accountApi()), reauthHref: reauthHref("/security") },
    fd
  )
  if (out.ok) {
    // The api call already dropped this request's cached Me (hasPassword: false), so the
    // revalidated render below reads the new value.
    revalidatePath("/security")
    revalidatePath("/", "layout")
  }
  return out
}

export async function disconnectIdentity(_prev: FormState, fd: FormData): Promise<FormState> {
  return revalidateOnSuccess(await disconnectIdentityCore(await accountApi(), fd))
}

// Two-step verification. `setup` never revalidates: it changes nothing until `enable` confirms
// it, and reloading the page is exactly how setup is meant to restart (no pending secret to lose).
export async function setupTwoFactor(
  _prev: TwoFactorSetupState,
  fd: FormData
): Promise<TwoFactorSetupState> {
  return setupTwoFactorCore({ ...(await accountApi()), reauthHref: reauthHref("/security") }, fd)
}

export async function enableTwoFactor(
  _prev: TwoFactorEnableState,
  fd: FormData
): Promise<TwoFactorEnableState> {
  const out = await enableTwoFactorCore(await accountApi(), fd)
  if (out.ok) revalidatePath("/security")
  return out
}

export async function disableTwoFactor(_prev: FormState, fd: FormData): Promise<FormState> {
  return revalidateOnSuccess(await disableTwoFactorCore(await accountApi(), fd))
}

export async function regenerateRecoveryCodes(
  _prev: TwoFactorRegenerateState,
  fd: FormData
): Promise<TwoFactorRegenerateState> {
  const out = await regenerateRecoveryCodesCore(await accountApi(), fd)
  if (out.ok) revalidatePath("/security")
  return out
}

// Passkeys. The first two are never a `<form action>` — `AddPasskeyForm` calls them directly,
// with the browser's WebAuthn ceremony running in between — so, unlike every other action here,
// they take no `_prev` and are not read by `useActionState`.
export async function passkeyRegisterOptions(fd: FormData): Promise<PasskeyRegisterOptionsState> {
  return passkeyRegisterOptionsCore(
    { ...(await accountApi()), reauthHref: reauthHref("/security") },
    fd
  )
}

export async function passkeyRegister(fd: FormData): Promise<PasskeyRegisterState> {
  const out = await passkeyRegisterCore(await accountApi(), fd)
  if (out.ok) revalidatePath("/security")
  return out
}

export async function renamePasskey(_prev: FormState, fd: FormData): Promise<FormState> {
  return revalidateOnSuccess(await renamePasskeyCore(await accountApi(), fd))
}

export async function deletePasskey(_prev: FormState, fd: FormData): Promise<FormState> {
  return revalidateOnSuccess(await deletePasskeyCore(await accountApi(), fd))
}
