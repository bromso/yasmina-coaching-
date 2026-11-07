import { rssFeed } from "@repo/content/feeds"
import { feedResponse } from "@/lib/feed-render"

export const dynamic = "force-static"

export const GET = () => feedResponse(rssFeed, "application/rss+xml; charset=utf-8")
