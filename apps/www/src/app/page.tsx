import { getLocale } from "@/lib/locale"
import { HomeView } from "@/views/home-view"

export default async function Page() {
  return <HomeView locale={await getLocale()} />
}
