"use client"

import { Button } from "@repo/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { consumeMagicLink } from "@/app/magic/actions"
import { FormMessage } from "@/components/form-message"
import type { FormState } from "@/lib/actions"

export function MagicContinueForm({ token, next }: { token: string; next?: string }) {
  const [state, action, pending] = useActionState(consumeMagicLink, { ok: false } as FormState)
  const t = useTranslations("auth")

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t("magic.continueTitle")}</CardTitle>
        <CardDescription>{t("magic.continueDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} noValidate>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="next" value={next ?? ""} />
          <div className="grid gap-6">
            <FormMessage state={state} />
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? t("magic.continuePending") : t("magic.continue")}
            </Button>
            {!state.ok && state.message ? (
              <div className="text-center text-sm">
                <Link href="/login" className="underline underline-offset-4">
                  {t("common.requestNewOne")}
                </Link>
              </div>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
