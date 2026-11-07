import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { ForgotPasswordView } from "@/views/forgot-password-view"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.pages")
  return { title: t("forgotPassword") }
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordView />
}
