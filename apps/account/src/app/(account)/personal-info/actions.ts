"use server"

import { revalidatePath } from "next/cache"
import {
  type EmailChangeRequestState,
  type FormState,
  removeAvatarCore,
  requestEmailChangeCore,
  setAvatarCore,
  setLocaleCore,
  updateProfileCore,
} from "@/lib/actions"
import { getAuth } from "@/lib/auth"
import { reauthHref } from "@/lib/reauth"

/** The session re-checked (a server action is a public endpoint of its own), then the api as
 * the user and the request's language. */
async function accountDeps() {
  const auth = getAuth()
  await auth.requireUser()
  return { api: (await auth.api()).account, locale: await auth.getLocale() }
}

export async function updateProfile(_prev: FormState, fd: FormData): Promise<FormState> {
  const out = await updateProfileCore(await accountDeps(), fd)
  if (out.ok) {
    // The api call above already dropped this request's cached Me (see @repo/session), so the
    // revalidated render below reads the new name.
    // The name shows in the shared layout (header, sidebar), so every page under it is refreshed.
    revalidatePath("/", "layout")
  }
  return out
}

export async function setAvatar(_prev: FormState, fd: FormData): Promise<FormState> {
  const out = await setAvatarCore(await accountDeps(), fd)
  if (out.ok) {
    // The avatar shows in the shared layout (header), so every page under it is refreshed.
    revalidatePath("/", "layout")
  }
  return out
}

export async function removeAvatar(_prev: FormState, _fd: FormData): Promise<FormState> {
  const out = await removeAvatarCore(await accountDeps())
  if (out.ok) {
    revalidatePath("/", "layout")
  }
  return out
}

/**
 * The Language card: saves the submitted `locale` to the profile (and the cookie) and answers in
 * the new language. Unlike the header switcher's `setLocale` (src/app/actions.ts), which redirects
 * back with `?locale_error=1`, this is a `useActionState` form like every other settings card: a
 * refusal is its `FormState`, never the error page.
 */
export async function setLanguage(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = getAuth()
  await auth.requireUser()
  return setLocaleCore(
    {
      locale: await auth.getLocale(),
      setLocale: (locale) => auth.setLocale(locale),
      // The whole tree, root layout included (`<html lang>`, the header), renders in the new
      // language: the save above already replaced this request's locale (see @repo/session).
      revalidate: () => revalidatePath("/", "layout"),
    },
    fd
  )
}

/**
 * The Email address card's **Change email** / **Send again** form. Nothing changes until the
 * link is confirmed, so — like `setupTwoFactor` never revalidating — there is nothing to refresh
 * here; the card's own pending notice already reflects the fresh answer.
 */
export async function requestEmailChange(
  _prev: EmailChangeRequestState,
  fd: FormData
): Promise<EmailChangeRequestState> {
  return requestEmailChangeCore(
    { ...(await accountDeps()), reauthHref: reauthHref("/personal-info") },
    fd
  )
}
