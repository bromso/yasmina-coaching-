import { docs } from "collections/server"
import { loader } from "fumadocs-core/source"
import { toFumadocsSource } from "fumadocs-mdx/runtime/server"

/**
 * Every job posting, loaded by fumadocs: one page per file, flat under content/jobs. Unchecked:
 * pages and routes import from `@/lib/jobs`, which validates every posting when it loads.
 */
export const source = loader({ baseUrl: "/", source: toFumadocsSource(docs.docs, docs.meta) })
