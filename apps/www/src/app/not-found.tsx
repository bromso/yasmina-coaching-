import { StatusPage } from "@repo/ui/blocks/status-page"
import { Button } from "@repo/ui/components/button"
import Link from "next/link"

import { Background } from "@/components/background"

export default function NotFound() {
  return (
    <Background>
      <StatusPage
        code="404"
        title="Page not found"
        description="The page you're looking for doesn't exist or has moved."
      >
        <Button asChild size="lg">
          <Link href="/">Back to home</Link>
        </Button>
      </StatusPage>
    </Background>
  )
}
