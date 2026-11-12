"use client"

import { Button } from "@repo/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { cn } from "@repo/ui/lib/utils"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type * as React from "react"
import { useActionState } from "react"
import { signIn } from "@/app/login/actions"
import { FieldError, FormMessage, fieldAria } from "@/components/form-message"
import { MagicLinkForm } from "@/components/magic-link-form"
import { PasskeySignIn } from "@/components/passkey-sign-in"
import { PasswordInput } from "@/components/password-input"
import { OrDivider } from "@/components/social-buttons"
import { TermsNote } from "@/components/terms-note"
import type { FormState } from "@/lib/actions"

export function LoginForm({
  className,
  next,
  social,
  legal,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  next?: string
  /** The legal app's terms and privacy URLs, for the consent line (from the server view). */
  legal: { termsHref: string; privacyHref: string }
  /** The provider buttons, rendered by the (server) view; null when none are configured. */
  social?: React.ReactNode
}) {
  const [state, action, pending] = useActionState(signIn, { ok: false } as FormState)
  const t = useTranslations("auth")

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("login.title")}</CardTitle>
          <CardDescription>
            {social ? t("login.subtitleWithSocial") : t("login.subtitleEmailOnly")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6">
            {social ? (
              <>
                {social}
                <OrDivider label={t("common.orContinueWith")} />
              </>
            ) : null}
            <PasskeySignIn next={next} dividerLabel={t("login.orPassword")} />
            <form action={action} noValidate>
              <input type="hidden" name="next" value={next ?? ""} />
              <div className="grid gap-6">
                <FormMessage state={state} />
                <div className="grid gap-2">
                  <Label htmlFor="email">{t("common.email")}</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder={t("common.emailPlaceholder")}
                    autoComplete="username webauthn"
                    required
                    defaultValue={state.ok ? "" : state.values?.email}
                    {...fieldAria("email", state)}
                  />
                  <FieldError name="email" state={state} />
                </div>
                <div className="grid gap-2">
                  <div className="flex items-center">
                    <Label htmlFor="password">{t("common.password")}</Label>
                    <Link
                      href="/forgot-password"
                      className="ml-auto text-sm underline-offset-4 hover:underline"
                    >
                      {t("login.forgotPassword")}
                    </Link>
                  </div>
                  <PasswordInput
                    id="password"
                    name="password"
                    autoComplete="current-password"
                    required
                    {...fieldAria("password", state)}
                  />
                  <FieldError name="password" state={state} />
                </div>
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? t("login.pending") : t("login.submit")}
                </Button>
              </div>
            </form>
            <OrDivider label={t("login.magicDivider")} />
            <MagicLinkForm />
            <div className="text-center text-sm">
              {t.rich("login.noAccount", {
                link: (chunks) => (
                  <Link
                    href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
                    className="underline underline-offset-4"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </div>
          </div>
        </CardContent>
      </Card>
      <TermsNote {...legal} />
    </div>
  )
}
