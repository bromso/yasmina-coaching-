---
name: nextjs-route-handlers
description: Create Next.js 16 App Router route handlers and server actions in this monorepo. Use when adding API endpoints (route.ts files), webhooks, server-side handlers, or type-safe server actions in apps/app or apps/www. Triggers on "API route", "endpoint", "webhook", "server action", "route handler", "GET handler", "POST handler".
---

# Next.js Route Handlers & Server Actions

Build route handlers and server actions for this monorepo's Next 16 apps.

## Project Context

- **apps/app** (port 3001): Application shell. Has a `/api/health` route handler that returns basic status info; otherwise no backend wired up.
- **apps/www** (port 3000): Marketing shell. Has a `/api/health` route handler that returns basic status info.
- Both apps run Next.js 16 with App Router under `src/app/`.
- The boilerplate is frontend-only; data layer / forms are intentionally deferred. Add Zod / next-safe-action / your-validator-of-choice when a real form or API surface needs them — they're not pre-installed anymore.

## When to use Route Handlers vs. Server Actions

| Need | Use |
|---|---|
| Webhook receiver | Route handler (`route.ts`) |
| Public REST API | Route handler |
| Form submission with progressive enhancement | Server action |
| Internal mutation tied to a UI | Server action |

## Route Handler Template

Create at `apps/<app>/src/app/api/<endpoint>/route.ts`:

```ts
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const body = await request.json()

  // Validate input here — bring your own validator (e.g. Zod, Valibot)
  // since this boilerplate doesn't ship one by default.

  return NextResponse.json({ ok: true })
}
```

Return `NextResponse.json` consistently for typed responses.

## Server Action Template

Create at `apps/<app>/src/actions/<action-name>.ts`:

```ts
"use server"

export async function submitContact(formData: FormData) {
  const email = formData.get("email")
  // Validate at the boundary, then run server logic.
  return { ok: true }
}
```

If you want type-safe actions with schema validation, install `next-safe-action` + a validator (e.g. `zod` from the workspace catalog) in the consuming workspace before scaffolding.

## Conventions

- Validate ALL input at the boundary — never trust unvalidated request bodies
- Return typed responses (`NextResponse.json` for handlers; action result for server actions)
- Place handlers under `src/app/api/<feature>/route.ts`
- Place server actions under `src/actions/<action>.ts`
- Use Biome for formatting (no semicolons, double quotes, 100-char width)
- Never call route handlers from inside the same Next app — use the underlying function or a server action

## Common Pitfalls

- Don't add `"use client"` to a route handler file (it's server-only)
- Don't return raw `Response` when `NextResponse.json` works — keeps types consistent
- For webhooks: verify signatures BEFORE parsing the body (raw body, not JSON-parsed)
