"use client"

import { Button } from "@repo/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { verifyTwoFactor } from "@/app/login/verify/actions"
import { FieldError, FormMessage, fieldAria } from "@/components/form-message"
import type { FormState } from "@/lib/actions"

/**
 * The code step: a 6-digit authenticator code by default, or a recovery code once `?recovery=1`
 * swaps the field — a plain link (not a client toggle), so it works without JavaScript too.
 */
export function TwoFactorForm({ next, recovery }: { next?: string; recovery: boolean }) {
  const [state, action, pending] = useActionState(verifyTwoFactor, { ok: false } as FormState)
  const t = useTranslations("auth.twoFactor")
  const toggleParams = new URLSearchParams()
  if (next) toggleParams.set("next", next)
  if (!recovery) toggleParams.set("recovery", "1")
  const toggleQuery = toggleParams.toString()

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>
          {recovery ? t("recoveryDescription") : t("appDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} noValidate>
          <input type="hidden" name="next" value={next ?? ""} />
          <div className="grid gap-6">
            <FormMessage state={state} />
            <div className="grid gap-2">
              <Label htmlFor="code">{recovery ? t("recoveryLabel") : t("codeLabel")}</Label>
              <Input
                id="code"
                name="code"
                inputMode={recovery ? "text" : "numeric"}
                autoComplete={recovery ? "off" : "one-time-code"}
                autoCapitalize={recovery ? "none" : undefined}
                spellCheck={recovery ? false : undefined}
                maxLength={recovery ? 20 : undefined}
                autoFocus
                required
                {...fieldAria("code", state)}
              />
              <FieldError name="code" state={state} />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? t("pending") : t("submit")}
            </Button>
            <div className="text-center text-sm">
              <Link
                href={`/login/verify${toggleQuery ? `?${toggleQuery}` : ""}`}
                className="underline underline-offset-4"
              >
                {recovery ? t("useApp") : t("useRecovery")}
              </Link>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
