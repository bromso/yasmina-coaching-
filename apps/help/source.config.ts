import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins"
import { defineConfig, defineDocs } from "fumadocs-mdx/config"
// A relative path, not "@repo/content/schema": fumadocs bundles this file with esbuild and leaves
// packages external, so a package import would make Node load the schema's .ts source at runtime
// (type stripping). Relative, it is bundled into .source/source.config.mjs; only zod stays external.
// See apps/docs/source.config.ts.
import { helpFrontmatterSchema } from "../../packages/content/src/schema"

/**
 * content/articles: every .mdx article (frontmatter checked against the strict help schema at
 * compile) and every meta.json (fumadocs' own meta schema: `title`, `pages` order, `description`,
 * …). Articles sit one level inside a category folder — `content/articles/<category>/<article>.mdx`
 * — `help-core.ts`'s `nestingProblems` reports anything shallower or deeper.
 */
export const docs = defineDocs({
  dir: "content/articles",
  docs: { schema: helpFrontmatterSchema },
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
