import { StatusPage } from "@repo/ui/blocks/status-page"
import { Background } from "@repo/ui/components/background"
import { Button } from "@repo/ui/components/button"
import Link from "next/link"
import { STATUS } from "@/content/status"
import { getLocale } from "@/lib/locale"

export default async function NotFound() {
  const copy = STATUS[await getLocale()]
  return (
    <Background>
      <StatusPage code="404" title={copy.notFound.title} description={copy.notFound.description}>
        <Button asChild size="lg">
          <Link href="/">{copy.home}</Link>
        </Button>
      </StatusPage>
    </Background>
  )
}
