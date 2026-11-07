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
import { forgotPassword } from "@/app/forgot-password/actions"
import { FieldError, FormMessage, fieldAria } from "@/components/form-message"
import type { FormState } from "@/lib/actions"

export function ForgotPasswordForm({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  const [state, action, pending] = useActionState(forgotPassword, { ok: false } as FormState)
  const t = useTranslations("auth")

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("forgotPassword.title")}</CardTitle>
          <CardDescription>{t("forgotPassword.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {state.ok ? (
            <div className="grid gap-6 text-center">
              <FormMessage state={state} />
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">{t("common.backToLogin")}</Link>
              </Button>
            </div>
          ) : (
            <form action={action} noValidate>
              <div className="grid gap-6">
                <FormMessage state={state} />
                <div className="grid gap-2">
                  <Label htmlFor="email">{t("common.email")}</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder={t("common.emailPlaceholder")}
                    autoComplete="email"
                    required
                    defaultValue={state.values?.email}
                    {...fieldAria("email", state)}
                  />
                  <FieldError name="email" state={state} />
                </div>
                <Button type="submit" className="w-full" disabled={pending}>
                  {pending ? t("forgotPassword.pending") : t("forgotPassword.submit")}
                </Button>
                <div className="text-center text-sm">
                  {t.rich("forgotPassword.remembered", {
                    link: (chunks) => (
                      <Link href="/login" className="underline underline-offset-4">
                        {chunks}
                      </Link>
                    ),
                  })}
                </div>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
