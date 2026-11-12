import { defineCollections, defineConfig } from "fumadocs-mdx/config"
// A relative path, not "@repo/content/schema": fumadocs bundles this file with esbuild and leaves
// packages external, so a package import would make Node load the schema's .ts source at runtime
// (type stripping). Relative, it is bundled into .source/source.config.mjs; only zod stays external.
import { legalFrontmatterSchema } from "../../packages/content/src/schema"

export const pages = defineCollections({
  type: "doc",
  dir: "content/pages",
  schema: legalFrontmatterSchema,
})

export default defineConfig()
