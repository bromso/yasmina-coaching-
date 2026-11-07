import { docs } from "collections/server"
import { loader } from "fumadocs-core/source"
import { toFumadocsSource } from "fumadocs-mdx/runtime/server"

/**
 * Every docs page and meta.json, loaded by fumadocs: `/` is content/docs/index.mdx, and a folder's
 * index.mdx is the folder's own URL. Unchecked: pages and routes import `source` from `@/lib/docs`,
 * which validates every page when it loads.
 */
export const source = loader({ baseUrl: "/", source: toFumadocsSource(docs.docs, docs.meta) })
