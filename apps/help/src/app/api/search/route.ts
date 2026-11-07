import { createFromSource } from "fumadocs-core/search/server"
import { source } from "@/lib/help"

// The search index, exported once at build: the dialog downloads it and searches in the browser.
export const dynamic = "force-static"
export const { staticGET: GET } = createFromSource(source)
