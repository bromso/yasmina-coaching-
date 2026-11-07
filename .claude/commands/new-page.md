Create a new page in one of the Next.js apps.

## Usage
`/new-page <app> <route>`

- **app**: `www`, `app`, `auth`, `account`, `docs`, `help` or `jobs`
- **route**: the URL path, lowercase with hyphens (e.g. `user-settings`, `blog/getting-started`)

## Instructions

Pages are thin wrappers that render a view; the view holds the composition.

1. Create the view at `apps/<app>/src/views/<last-route-segment>-view.tsx` with a named PascalCase
   export, composed from `@repo/ui/blocks/*` and `@repo/ui/components/*`:

```tsx
import { Hero } from "@repo/ui/blocks/hero"

export function UserSettingsView() {
  return (
    <main id="main">
      <Hero eyebrow="Settings" title="User settings" description="Manage your preferences." />
    </main>
  )
}
```

2. Create the page at `apps/<app>/src/app/<route>/page.tsx`:

```tsx
import { UserSettingsView } from "@/views/user-settings-view"

export default function UserSettingsPage() {
  return <UserSettingsView />
}
```

3. Keep `id="main"` on the view's main landmark (the skip link targets it).
4. If the app groups routes (e.g. `apps/account/src/app/(account)/`), follow that app's existing
   structure and navigation.

## Example
`/new-page app user-settings` creates `apps/app/src/views/user-settings-view.tsx` and
`apps/app/src/app/user-settings/page.tsx`.
