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
import { signUp } from "@/app/signup/actions"
import { FieldError, FormMessage, fieldAria } from "@/components/form-message"
import { PasswordInput } from "@/components/password-input"
import { OrDivider } from "@/components/social-buttons"
import { TermsNote } from "@/components/terms-note"
import type { FormState } from "@/lib/actions"

export function SignupForm({
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
  const [state, action, pending] = useActionState(signUp, { ok: false } as FormState)
  const t = useTranslations("auth")

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("signup.title")}</CardTitle>
          <CardDescription>
            {social ? t("signup.subtitleWithSocial") : t("signup.subtitleEmailOnly")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} noValidate>
            <input type="hidden" name="next" value={next ?? ""} />
            <div className="grid gap-6">
              {social ? (
                <>
                  {social}
                  <OrDivider label={t("common.orContinueWith")} />
                </>
              ) : null}
              <div className="grid gap-6">
                <FormMessage state={state} />
                <div className="grid gap-2">
                  <Label htmlFor="name">{t("signup.name")}</Label>
                  <Input
                    id="name"
                    name="name"
                    placeholder={t("signup.namePlaceholder")}
                    autoComplete="name"
                    defaultValue={state.ok ? "" : state.values?.name}
                    {...fieldAria("name", state)}
                  />
                  <FieldError name="name" state={state} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">{t("common.email")}</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder={t("common.emailPlaceholder")}
                    autoComplete="email"
                    required
                    defaultValue={state.ok ? "" : state.values?.email}
                    {...fieldAria("email", state)}
                  />
                  <FieldError name="email" state={state} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="password">{t("common.password")}</Label>
                  <PasswordInput
                    id="password"
                    name="password"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    {...fieldAria("password", state, "password-hint")}
                  />
                  <p id="password-hint" className="text-muted-foreground text-xs">
                    {t("common.passwordHint")}
                  </p>
                  <FieldError name="password" state={state} />
                </div>
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? t("signup.pending") : t("signup.submit")}
                </Button>
              </div>
              <div className="text-center text-sm">
                {t.rich("signup.haveAccount", {
                  link: (chunks) => (
                    <Link
                      href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
                      className="underline underline-offset-4"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
      <TermsNote {...legal} />
    </div>
  )
}
