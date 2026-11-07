import { atomFeed } from "@repo/content/feeds"
import { feedResponse } from "@/lib/feed-render"

export const dynamic = "force-static"

export const GET = () => feedResponse(atomFeed, "application/atom+xml; charset=utf-8")
