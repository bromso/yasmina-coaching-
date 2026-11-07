import { siteUrl } from "@repo/sites"
import type { Metadata } from "next"
import { jobsByTeam, openJobs } from "@/lib/jobs"
import { HomeView } from "@/views/home-view"

export const metadata: Metadata = {
  description: "Open roles, grouped by team.",
  alternates: { canonical: siteUrl("jobs") },
}

export default function Page() {
  return <HomeView teams={jobsByTeam(openJobs())} />
}
