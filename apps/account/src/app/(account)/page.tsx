import type { Metadata } from "next"
import { connection } from "next/server"
import { getTranslations } from "next-intl/server"
import { getAuth } from "@/lib/auth"
import { HomeView } from "@/views/home-view"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account.meta"))("home") }
}

export default async function Page() {
  await connection()
  const user = await getAuth().requireUser()
  return <HomeView user={user} />
}
