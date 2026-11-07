import { docs } from "collections/server"
import { loader } from "fumadocs-core/source"
import { toFumadocsSource } from "fumadocs-mdx/runtime/server"

/**
 * Every help article and meta.json, loaded by fumadocs: a category's `meta.json` names its
 * folder, each article is its own page. Unchecked: pages and routes import from `@/lib/help`,
 * which validates every article when it loads.
 */
export const source = loader({ baseUrl: "/", source: toFumadocsSource(docs.docs, docs.meta) })
