---
name: add-mdx-page
description: MUST USE for ANY request to add a marketing, content, landing, pricing, about, features, team, or blog page to apps/www (the marketing site). Creates an MDX-powered page (and, the first time, sets up @next/mdx in apps/www). Trigger phrases - "add a pricing page to the marketing site", "create an about page in apps/www", "build a features landing page", "add a /blog/SLUG post", "marketing page about our team", "new content page", "MDX page", "landing page", "blog post". Skip for pages in the other Next apps (use the /new-page command), shared UI components (use add-ui-component), or API routes (use nextjs-route-handlers).
---

# Add MDX Page (apps/www)

Create an MDX page in the marketing site.

## Prerequisite: MDX support (not set up yet)

apps/www does not ship with MDX. The first time this skill runs, set it up once
(steps from the Next.js MDX guide, adapted to this repo):

1. Install — used by one workspace, so literal ranges in apps/www (CLAUDE.md dependency rule 3):
   `bun add @next/mdx @mdx-js/loader @mdx-js/react --cwd apps/www` and
   `bun add -d @types/mdx --cwd apps/www`
2. `apps/www/next.config.ts`: add `pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"]` and wrap
   the config with `createMDX()` from `@next/mdx`, inside the existing
   `withBundleAnalyzer(withSerwist(...))` chain.
3. Create `apps/www/src/mdx-components.tsx` (required for App Router; it lives in `src/` because the
   app uses a `src` directory) exporting `useMDXComponents`.
4. Verify with `bun --filter @repo/www build` before writing content.

## File Layout

For a route `/SLUG`:

- Either: `apps/www/src/app/SLUG/page.mdx` (file-based MDX, simplest)
- Or: `apps/www/src/app/SLUG/page.tsx` that imports content from `apps/www/src/content/SLUG.mdx`

Prefer the first form unless the page needs significant TSX scaffolding.

## Workflow

### 1. Create the page

For `/about`:

File: `apps/www/src/app/about/page.mdx`

```mdx
export const metadata = {
  title: "About",
  description: "Our mission and team.",
}

# About us

We build software that…

<Feature title="Mission">
  Solving X for Y.
</Feature>

## Team

- Jonas Bröms — Founder
- …
```

### 2. Custom MDX components

If you need custom components inside MDX (`<Feature>`, `<CallToAction>`, etc.):

File: `apps/www/mdx-components.tsx` (root of `apps/www/src/`)

```tsx
import type { MDXComponents } from "mdx/types"
import { Card } from "@repo/ui/components/card"

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    Feature: ({ title, children }) => (
      <Card className="p-4">
        <h3 className="font-semibold">{title}</h3>
        <div>{children}</div>
      </Card>
    ),
    h1: ({ children }) => <h1 className="text-4xl font-bold">{children}</h1>,
  }
}
```

If `mdx-components.tsx` already exists, extend it rather than overwriting.

### 3. Verify

```bash
bun --filter @repo/www dev    # visit http://localhost:3000/SLUG
bun typecheck
bun lint
```

### 4. SEO

Always export `metadata` from the MDX file with `title` and `description`. Next 16's metadata API picks it up automatically.

## When NOT to use this skill

- Pages in the other Next apps — use the `/new-page` command (a view + a thin page)
- Highly interactive pages with lots of state — use a `.tsx` page instead of `.mdx`
- API routes — use `nextjs-route-handlers`

## Cross-references

- For shared content components: see `add-ui-component` skill
- For animations on the page: see `fixing-motion-performance` skill
