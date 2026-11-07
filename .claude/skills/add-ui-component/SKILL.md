---
name: add-ui-component
description: MUST USE for ANY request to create, add, or build a shared UI component, primitive, atom, widget, or design-system element in this Bun workspaces monorepo. Always creates two files - the component at packages/ui/src/components/NAME.tsx AND a Storybook story at apps/story/stories/NAME.stories.tsx. Use for Badge, Button, Card, Modal, Tooltip, Dialog, Switch, Tabs, Avatar, or any reusable widget. Trigger phrases - "add a Badge component", "create a reusable Modal", "build a Tooltip", "I need a Card in the design system", "add a shadcn Switch component to the UI package", "new UI primitive", "shared component", "reusable widget", "add to packages/ui", "add a component to the shared UI package". Skip ONLY for app-specific forms/layouts that import app data (those live in apps/APPNAME/src/components/), marketing pages, or dashboard route pages.
---

# Add UI Component (packages/ui)

Create a shared component in `packages/ui` with a matching Storybook story.

## When to put a component in packages/ui vs. an app

Put it in **packages/ui** if:
- It's a primitive, atom, or generic widget (Button, Card, Tabs, Tooltip)
- More than one app could use it
- It's a thin wrapper around Radix / Base UI / Headless UI

Keep it in **apps/<app>/src/components/** if:
- It's bound to one app's data (a specific form, a dashboard-only layout)
- It imports from `@/data/...` or app-specific routes

## Workflow

### 1. Decide: shadcn-style or custom?

If a shadcn component fits, use the shadcn CLI:

```bash
bunx --bun shadcn@latest add <component> -c packages/ui
```

This drops the component into `packages/ui/src/components/<component>.tsx` already wired to this repo's setup. Then write a Storybook story (step 4 below).

For a custom component, continue with steps 2-4.

### 2. Create the component

File: `packages/ui/src/components/<component-name>.tsx`

```tsx
import * as React from "react"
import { cn } from "@repo/ui/lib/utils"

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "outline"
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        variant === "default" && "bg-primary text-primary-foreground",
        variant === "outline" && "border border-input",
        className,
      )}
      {...props}
    />
  )
}
```

Conventions:
- Always accept `className` and merge with `cn()`
- Always spread remaining props to the root element
- Use `React.forwardRef` for components that need ref forwarding
- For complex primitives, compose Radix or Base UI (already installed in `packages/ui`)
- Use `class-variance-authority` (`cva`) for components with multiple variants — pattern matches existing components

### 3. Export the component

Check `packages/ui/package.json` `exports` field. If components are exported individually (`@repo/ui/components/<name>`), the file you created at the canonical path is automatically importable. No re-export step needed.

### 4. Create Storybook story

File: `apps/story/stories/<ComponentName>.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react"
import { Badge } from "@repo/ui/components/badge"

const meta: Meta<typeof Badge> = {
  title: "Components/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline"],
    },
  },
}
export default meta
type Story = StoryObj<typeof Badge>

export const Default: Story = {
  args: { children: "Badge" },
}

export const Outline: Story = {
  args: { variant: "outline", children: "Outline" },
}
```

### 5. Verify

```bash
bun --filter @repo/story dev   # browse the story
bun typecheck
bun lint
```

### 6. Use it

Import in any app:

```tsx
import { Badge } from "@repo/ui/components/badge"
```

## Common Pitfalls

- **Never** install shadcn components into an app — only into `packages/ui` (`-c packages/ui`)
- Don't add a Storybook story under `packages/ui` itself — stories live in `apps/story`
- Don't import from `@repo/ui/src/...` — only from the public `@repo/ui/components/<name>` path

## Cross-references

- shadcn primitives: see `shadcn` skill
- For composition patterns (compound components, render props): see `vercel-composition-patterns` skill
- For animations: see `fixing-motion-performance` skill
