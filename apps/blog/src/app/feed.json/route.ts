import { jsonFeed } from "@repo/content/feeds"
import { feedResponse } from "@/lib/feed-render"

export const dynamic = "force-static"

export const GET = () => feedResponse(jsonFeed, "application/feed+json; charset=utf-8", "sv")
