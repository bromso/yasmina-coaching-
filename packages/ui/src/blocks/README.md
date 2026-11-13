# Blocks

Reusable section patterns composed of components from `../components/`.

A block is content-agnostic (takes props), composable, and meant to be assembled into views by an app.

**Import direction:** blocks may import from `../components/`. They may NOT import from any app's `views/` or pages.

## The marketing kit (landing blocks)

`SectionHeading` (`../components/section-heading.tsx`) is the eyebrow/title/description trio every
landing block below starts with — it is a component, not a block, so views compose it directly too
(e.g. a page that needs the heading alone). Every block that takes one accepts a `SectionHeadingProps`
object as its `heading` prop.

| Block | One-liner |
|---|---|
| `Hero` (`hero.tsx`) | The top-of-page band: eyebrow/title/description plus action slot. |
| `LogoCloud` (`logo-cloud.tsx`) | A logo strip under an optional caption. |
| `FeatureGrid` (`feature-grid.tsx`) | A heading plus a grid of feature cards, each an `<article>`. |
| `Testimonials` (`testimonials.tsx`) | A heading plus a grid of quote cards, each a `<figure>`. |
| `Cta` (`cta.tsx`) | A call-to-action band: title, optional description, and actions. |
| `Pricing` (`pricing.tsx`) | A heading plus a tier grid — one card per plan, the highlighted tier badged and ringed. |
| `Faq` (`faq.tsx`) | A heading plus an accordion of questions; `jsonLd` emits FAQPage structured data for string answers. |
| `Newsletter` (`newsletter.tsx`) | A signup form: heading, email field, submit — the app owns the server action. |
| `LegalPage` (`legal-page.tsx`) | A terms/privacy-style page: title, last-updated date, an optional notice, a contents nav, and sections. |

**Composition rules** (every block above follows these):
- The block root is a `<section>` (or `<article>` for `LegalPage`) carrying `aria-labelledby` wired
  to its own `SectionHeading` via `useId()` — never a bare `<div>`.
- Wrapped in `container` (plus a `max-w-*` where the content reads better narrower, e.g. `Faq`,
  `Newsletter`, `LegalPage`).
- `className` merged last with `cn()` from `@repo/ui/lib/utils`; an optional `id` prop so a page can
  deep-link to the section.
- Links are plain `<a href>`, not a router's `<Link>` — blocks don't know which app they're in.
- No data fetching, no `"use client"` beyond what an imported component already needs (e.g.
  `Accordion`) — a block renders what it's given.

**`Newsletter` is the one exception worth calling out explicitly: the app owns the action.** The block
takes `action: (formData: FormData) => void | Promise<void>` and `state: FormState` as plain props and
renders a real `<form action={action}>` — it has no `useActionState` of its own. The calling view
wires up `useActionState` (or a server action) and passes the resulting `action` and `state` down, the
same way `apps/account`'s forms already do with `@repo/ui/components/form-feedback`.

`apps/www`'s home page is the reference composition: `apps/www/src/content/home.tsx` holds every
word, and `apps/www/src/views/home-view.tsx` only arranges the blocks, in landing-page order (`Hero` →
`LogoCloud` → `FeatureGrid` → `Testimonials` → `Pricing` → `Faq` → `Cta` → `Newsletter`; www's own
home page no longer renders `Newsletter`, its contact section links the `/kontakt` page instead).
`LegalPage` has no caller in the apps today (the legal text lives in `apps/legal`, as MDX); its
story is `apps/story/stories/LegalPage.stories.tsx`.

## Other blocks

Not every block here is a landing-page block; the ones below are content-agnostic the same way,
just used elsewhere.

- `TwoFactorRequiredNotice` (`two-factor-required-notice.tsx`) — shown in place of a workspace page
  when the workspace requires two-step verification (or a passkey) and the signed-in member has
  turned on neither: a title, a body naming what to do, a **Set up two-step verification** link
  (`setupHref`/`setupLabel`), and two optional slots the calling app fills with its own controls —
  `switchSlot` (switch to another workspace, or make one) and `leaveSlot` (leave this one). Props
  only, no client hooks and no navigation of its own, so an app renders it server-side and it works
  without JavaScript. Used by `apps/app` (`/notes`, `/chat`) and `apps/account` (`/workspace`,
  `/payments`) — see CLAUDE.md's **Required two-step.** paragraph.
- `NotificationBell` (`notification-bell.tsx`) — the signed-in header's bell: a link (`href`,
  `label` for its accessible name) with an inline SVG icon, an `aria-hidden` badge
  (`notificationBadge(count)`, capped `99+`) and a sibling `role="status"` sr-only span (`liveLabel
  ?? label`) that announces a changed count politely rather than interrupting. `count: number |
  null` — `null` (the count could not be read) renders no badge at all, never a `0`-looking one.
  Server component, no client hooks, no client JavaScript of its own: a later re-render
  (`router.refresh()`, a server action's `refresh()`) is how the badge and the live region update.
  Rendered by `app`, `auth` and `account` in `SiteHeader`'s `end` slot, next to `UserMenu` — see
  CLAUDE.md's **Notifications.** paragraph and `apps/api/README.md`'s **Notifications** section.

## Conventions

- One block per file: `<block-name>.tsx`
- Named export matching the file (PascalCase)
- All content as props, with sensible defaults for storybook
- `className` prop accepted, merged with `cn()` from `@repo/ui/lib/utils`
- A matching Storybook story at `apps/story/stories/<BlockName>.stories.tsx`
