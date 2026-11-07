"use client"

import { Button } from "@repo/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { Label } from "@repo/ui/components/label"
import { cn } from "@repo/ui/lib/utils"
import Link from "next/link"
import { useTranslations } from "next-intl"
import type * as React from "react"
import { useActionState } from "react"
import { resetPassword } from "@/app/reset-password/actions"
import { FieldError, FormMessage, fieldAria } from "@/components/form-message"
import { PasswordInput } from "@/components/password-input"
import type { FormState } from "@/lib/actions"

export function ResetPasswordForm({
  className,
  token,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, { ok: false } as FormState)
  const t = useTranslations("auth")

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("resetPassword.title")}</CardTitle>
          <CardDescription>{t("resetPassword.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} noValidate>
            <input type="hidden" name="token" value={token} />
            <div className="grid gap-6">
              <FormMessage state={state} />
              <FieldError name="token" state={state} />
              <div className="grid gap-2">
                <Label htmlFor="password">{t("resetPassword.newPassword")}</Label>
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
              <div className="grid gap-2">
                <Label htmlFor="confirm">{t("resetPassword.confirm")}</Label>
                <PasswordInput
                  id="confirm"
                  name="confirm"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  {...fieldAria("confirm", state)}
                />
                <FieldError name="confirm" state={state} />
              </div>
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? t("resetPassword.pending") : t("resetPassword.submit")}
              </Button>
              <div className="text-center text-sm">
                {t.rich("resetPassword.expired", {
                  link: (chunks) => (
                    <Link href="/forgot-password" className="underline underline-offset-4">
                      {chunks}
                    </Link>
                  ),
                })}
              </div>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
