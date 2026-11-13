import type { MetadataRoute } from "next"
import { legalRobots } from "@/lib/robots"

export default function robots(): MetadataRoute.Robots {
  return legalRobots()
}
