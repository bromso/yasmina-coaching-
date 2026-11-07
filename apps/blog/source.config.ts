import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins"
import { defineCollections, defineConfig } from "fumadocs-mdx/config"
// A relative path, not "@repo/content/schema": fumadocs bundles this file with esbuild and leaves
// packages external, so a package import would make Node load the schema's .ts source at runtime
// (type stripping). Relative, it is bundled into .source/source.config.mjs; only zod stays external.
import { postFrontmatterSchema } from "../../packages/content/src/schema"

export const posts = defineCollections({
  type: "doc",
  dir: "content/posts",
  schema: postFrontmatterSchema,
})

export default defineConfig({
  mdxOptions: {
    // Measure `![alt](/x.png)` from public/ and set width/height on a plain string `src`. The
    // bundler default imports the file instead, handing MdxImage's <img> an object as `src`.
    remarkImageOptions: { useImport: false },
    rehypeCodeOptions: {
      ...rehypeCodeDefaultOptions,
      // The "-default" GitHub themes: every token colour clears WCAG 4.5:1 on its own background
      // (github-dark's comments are 3.05:1, github-light's parameters 3.49:1).
      themes: { light: "github-light-default", dark: "github-dark-default" },
    },
  },
})
