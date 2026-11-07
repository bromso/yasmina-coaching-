# Marketing Kit (Phase 6c) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eight content-agnostic landing blocks in `packages/ui`, a full demo landing page plus `/terms` and `/privacy` on `www`, a waitlist in `apps/api` wired through a server action, cookie consent, and OG images + real sitemaps for every app.

**Architecture:** Blocks are props-driven `<section>`s in `packages/ui/src/blocks/` with stories and `renderToStaticMarkup` tests; `www` composes them from typed content files and stays fully static. The waitlist is a `waitlist` table + public `waitlist.join` procedure in `apps/api`; `www` calls it from a server action using `@repo/session`'s api client with the service token. Consent is a `consent` cookie on the parent domain with a pure parser and a client banner. OG images come from one `ogImage()` renderer; sitemaps/robots from a per-app `PUBLIC_ROUTES` list and `@repo/sites`.

**Tech Stack:** Bun, React 19, Next 16 (`next/og`, metadata routes, server actions), oRPC, `Bun.sql`, `@repo/email`, Storybook 10, Biome.

**Spec:** `docs/superpowers/specs/2026-10-02-marketing-kit-design.md`

## Global Constraints

- Biome 0 errors / 0 warnings / 0 infos; double quotes, no semicolons, 2-space, 100 cols; `bunx biome check --write <paths>` before each commit.
- Commit trailer, the only attribution line: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`; subjects ≤ 100 chars.
- Blocks: kebab-case files, PascalCase exports, `cn()` for `className`, plain `<a>` for links, a `<section>` root with optional `id`, never fetch and never import a view or page; each has a story under `Blocks/*` (or `Components/*`) and a test.
- Every `www` route stays static (`○` in the build), including `/opengraph-image`; `apps/www` reads no cookies/headers in pages.
- Waitlist: `waitlist.join` answers `{ joined: true }` for new and repeated emails alike; limiter `waitlist:<clientId>` 5 / 15 min → `TOO_MANY_REQUESTS` ("Too many requests, try again in a few minutes"); emails normalised (`normalizeEmail`); the welcome mail is sent only for a new row, via `detach()`.
- Consent cookie: name `consent`, values `all | necessary`, `Path=/`, `Max-Age=15552000` (180 days), `SameSite=Lax`, `Secure` in production, `Domain` = the app's cookie domain (`.brand.localhost` in dev).
- OG: 1200×630 PNG, `OG_SIZE` shared; sitemaps/robots use `siteUrl()` — no literal `brand.com` anywhere.
- Copy: newsletter success "You're on the list — check your inbox."; limited → the api message; other failures "Something went wrong, try again later."; legal notice "This is a template, not legal advice — review it with counsel before publishing."; consent text "We use cookies for sign-in and, if you allow it, to understand how the site is used." with buttons **Accept all** / **Necessary only**.
- `apps/app` pages are not modified except the root layout (consent banner) and the OG/sitemap/robots files.

## Review Focus

1. The newsletter form must work without JavaScript: `Newsletter` renders a real `<form action>` with a submit button and a named email field — Task 2 test asserts the markup; the browser pass submits with JS disabled.
2. A cookie header containing several cookies, spaces, or a garbage `consent` value must parse to the right value or `null`, never throw — Task 3 test.
3. With `SITE_DOMAIN=example.com` the sitemap and robots must emit `https://www.example.com/...` — Task 4 test injects the env into `siteUrl`.
4. `Ada@Example.com ` and `ada@example.com` are the same waitlist entry (one row, one mail) — Task 5 test.
5. `Faq` with `jsonLd` and a `ReactNode` answer must not throw; it emits JSON-LD only for string answers — Task 2 test.

---

### Task 1: Blocks I — `SectionHeading`, `LogoCloud`, `FeatureGrid`, `Testimonials`, `Cta`

**Files:**
- Create: `packages/ui/src/components/section-heading.tsx`, `packages/ui/src/blocks/logo-cloud.tsx`, `feature-grid.tsx`, `testimonials.tsx`, `cta.tsx`, `packages/ui/src/blocks/blocks-1.test.tsx`
- Create: `apps/story/stories/blocks/SectionHeading.stories.tsx`, `LogoCloud.stories.tsx`, `FeatureGrid.stories.tsx`, `Testimonials.stories.tsx`, `Cta.stories.tsx` (check how existing block stories are titled/located — `apps/story/stories/SiteHeader.stories.tsx` is at the top level with title `Blocks/SiteHeader`; follow that location, i.e. top-level files, titles `Blocks/<Name>`)

**Interfaces:**
- Produces: `SectionHeadingProps = { eyebrow?: string; title: string; description?: string; align?: "center" | "start"; className?: string }`; `LogoCloud({ title?, logos: { name: string; src?: string; node?: ReactNode }[], id?, className? })`; `FeatureGrid({ heading: SectionHeadingProps, features: { icon?: ReactNode; title: string; description: string }[], columns?: 2 | 3 | 4, id?, className? })`; `Testimonials({ heading?: SectionHeadingProps, items: { quote: string; name: string; role?: string; avatar?: { src?: string; initials: string } }[], id?, className? })`; `Cta({ title: string; description?: string; actions: ReactNode; id?, className? })`.

- [ ] **Step 1: Failing tests** (`blocks-1.test.tsx`):
```tsx
import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Cta } from "./cta"
import { FeatureGrid } from "./feature-grid"
import { LogoCloud } from "./logo-cloud"
import { Testimonials } from "./testimonials"

describe("LogoCloud", () => {
  test("renders a labelled section; img logos carry the name as alt, node logos a hidden name", () => {
    const html = renderToStaticMarkup(
      <LogoCloud title="Trusted by" logos={[{ name: "Acme", src: "/acme.svg" }, { name: "Globex", node: <svg aria-hidden="true" /> }]} />
    )
    expect(html).toMatch(/<section[^>]*aria-labelledby=/)
    expect(html).toContain('alt="Acme"')
    expect(html).toContain("Globex")
  })
})

describe("FeatureGrid", () => {
  test("renders the heading and one article per feature with the column count", () => {
    const html = renderToStaticMarkup(
      <FeatureGrid heading={{ title: "Why" }} columns={2} features={[{ title: "Fast", description: "Very" }, { title: "Safe", description: "Quite" }]} />
    )
    expect(html).toMatch(/<h2[^>]*>Why<\/h2>/)
    expect((html.match(/<article/g) ?? []).length).toBe(2)
    expect(html).toContain("md:grid-cols-2")
  })
})

describe("Testimonials", () => {
  test("uses figure/blockquote/figcaption and initials when no avatar image", () => {
    const html = renderToStaticMarkup(
      <Testimonials items={[{ quote: "Great.", name: "Ada", role: "CTO", avatar: { initials: "AL" } }]} />
    )
    expect(html).toContain("<figure")
    expect(html).toContain("<blockquote")
    expect(html).toContain("<figcaption")
    expect(html).toContain("AL")
    expect(html).toContain("Ada")
  })
})

describe("Cta", () => {
  test("renders the title and the actions", () => {
    const html = renderToStaticMarkup(<Cta title="Ready?" actions={<a href="/signup">Start</a>} />)
    expect(html).toMatch(/<h2[^>]*>Ready\?<\/h2>/)
    expect(html).toContain('href="/signup"')
  })
})
```

- [ ] **Step 2: Run to verify they fail** — `bun test packages/ui/src/blocks/blocks-1.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

`section-heading.tsx`:
```tsx
import { cn } from "@repo/ui/lib/utils"

export type SectionHeadingProps = {
  eyebrow?: string
  title: string
  description?: string
  align?: "center" | "start"
  className?: string
  /** Set by blocks so the section can be labelled by its heading. */
  id?: string
}

/** The eyebrow / title / description trio every landing block starts with. */
export function SectionHeading({ eyebrow, title, description, align = "center", className, id }: SectionHeadingProps) {
  return (
    <div className={cn("flex max-w-2xl flex-col gap-3", align === "center" && "mx-auto text-center", className)}>
      {eyebrow && <span className="font-medium text-muted-foreground text-sm uppercase tracking-wider">{eyebrow}</span>}
      <h2 id={id} className="text-balance font-semibold text-3xl tracking-tight md:text-4xl">{title}</h2>
      {description && <p className="text-balance text-muted-foreground md:text-lg">{description}</p>}
    </div>
  )
}
```
Each block: `useId()` is unavailable in RSC-rendered static markup tests? It is available (`react` `useId` works in server rendering). Use `useId()` to build the heading id and set `aria-labelledby` on the `<section>` when a heading exists.

`logo-cloud.tsx`:
```tsx
import { cn } from "@repo/ui/lib/utils"
import { type ReactNode, useId } from "react"

export type Logo = { name: string; src?: string; node?: ReactNode }

export function LogoCloud({ title, logos, id, className }: { title?: string; logos: Logo[]; id?: string; className?: string }) {
  const headingId = useId()
  return (
    <section id={id} aria-labelledby={title ? headingId : undefined} className={cn("container py-12", className)}>
      {title && <p id={headingId} className="mb-8 text-center text-muted-foreground text-sm">{title}</p>}
      <ul className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-70 grayscale">
        {logos.map((logo) => (
          <li key={logo.name} className="flex h-8 items-center">
            {logo.src ? (
              <img src={logo.src} alt={logo.name} className="h-full w-auto" />
            ) : (
              <>
                <span aria-hidden="true" className="h-full [&>svg]:h-full [&>svg]:w-auto">{logo.node}</span>
                <span className="sr-only">{logo.name}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
```
(`title` is a `<p>` here on purpose — a logo strip is not a document section heading; the test only asserts `aria-labelledby`.)

`feature-grid.tsx`:
```tsx
import { cn } from "@repo/ui/lib/utils"
import { type ReactNode, useId } from "react"
import { SectionHeading, type SectionHeadingProps } from "../components/section-heading"

export type Feature = { icon?: ReactNode; title: string; description: string }
const cols = { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-2 lg:grid-cols-4" } as const

export function FeatureGrid({ heading, features, columns = 3, id, className }: { heading: SectionHeadingProps; features: Feature[]; columns?: 2 | 3 | 4; id?: string; className?: string }) {
  const headingId = useId()
  return (
    <section id={id} aria-labelledby={headingId} className={cn("container py-20", className)}>
      <SectionHeading {...heading} id={headingId} />
      <div className={cn("mt-12 grid gap-8", cols[columns])}>
        {features.map((f) => (
          <article key={f.title} className="flex flex-col gap-3">
            {f.icon && <div aria-hidden="true" className="flex size-10 items-center justify-center rounded-md bg-muted text-foreground">{f.icon}</div>}
            <h3 className="font-semibold">{f.title}</h3>
            <p className="text-muted-foreground text-sm">{f.description}</p>
          </article>
        ))}
      </div>
    </section>
  )
}
```
`testimonials.tsx`: same section/heading pattern (`heading` optional → `aria-labelledby` only when present); each item `<figure className="rounded-lg border p-6"><blockquote className="text-pretty">{quote}</blockquote><figcaption className="mt-4 flex items-center gap-3">{avatar: <Avatar className="size-9"><AvatarImage src/><AvatarFallback>{initials}</AvatarFallback></Avatar> (from `@repo/ui/components/avatar`)}<div><div className="font-medium text-sm">{name}</div>{role && <div className="text-muted-foreground text-xs">{role}</div>}</div></figcaption></figure>` in a `md:grid-cols-3` grid. `cta.tsx`: `<section id aria-labelledby className="container py-20"><div className="rounded-2xl bg-primary px-6 py-16 text-center text-primary-foreground"><h2 id className="text-balance font-semibold text-3xl tracking-tight md:text-4xl">{title}</h2>{description && <p className="mx-auto mt-4 max-w-xl text-balance opacity-90">{description}</p>}<div className="mt-8 flex flex-wrap items-center justify-center gap-3">{actions}</div></div></section>`.

- [ ] **Step 4: Stories** — one file per block, `Meta`/`StoryObj` as in `apps/story/stories/SiteFooter.stories.tsx`, `tags: ["autodocs"]`, sample args, a `play` per block: `LogoCloud` → `getByRole("list")` has N items; `FeatureGrid` → `getAllByRole("article")` length; `Testimonials` → `getAllByRole("figure")`; `Cta` → `getByRole("link", { name: "Start" })`; `SectionHeading` → heading level 2 text.

- [ ] **Step 5: Verify + commit**
Run: `bun test packages/ui/src/blocks && bun run --filter @repo/ui typecheck && cd apps/story && bunx vitest run --project=storybook stories/LogoCloud.stories.tsx stories/FeatureGrid.stories.tsx stories/Testimonials.stories.tsx stories/Cta.stories.tsx stories/SectionHeading.stories.tsx`
```bash
bunx biome check --write packages/ui apps/story
git add packages/ui apps/story
git commit -m "feat(ui): landing blocks I — SectionHeading, LogoCloud, FeatureGrid, Testimonials, Cta"
```

---

### Task 2: Blocks II — `Pricing`, `Faq`, `Newsletter`, `LegalPage`; blocks README

**Files:**
- Create: `packages/ui/src/blocks/pricing.tsx`, `faq.tsx`, `newsletter.tsx`, `legal-page.tsx`, `packages/ui/src/blocks/blocks-2.test.tsx`; stories `Pricing`, `Faq`, `Newsletter`, `LegalPage`
- Modify: `packages/ui/src/blocks/README.md`

**Interfaces:**
- Produces: `Pricing({ heading, tiers: { name; price: string; period?: string; description?: string; features: string[]; cta: { label: string; href: string }; highlighted?: boolean }[], note?: ReactNode, id?, className? })`; `Faq({ heading, items: { question: string; answer: ReactNode }[], jsonLd?: boolean, id?, className? })`; `Newsletter({ heading: SectionHeadingProps, description?, action: (fd: FormData) => void | Promise<void>, state: FormState, buttonLabel?: string, legal?: ReactNode, idPrefix?: string, id?, className? })`; `LegalPage({ title: string; updatedAt: string; sections: { id: string; title: string; paragraphs: string[] }[]; notice?: ReactNode; className? })`; `LegalSection` type exported.

- [ ] **Step 1: Failing tests** (`blocks-2.test.tsx`):
```tsx
describe("Pricing", () => {
  test("names each CTA after its tier and badges the highlighted tier", () => {
    const html = renderToStaticMarkup(
      <Pricing heading={{ title: "Pricing" }} tiers={[
        { name: "Free", price: "$0", features: ["A"], cta: { label: "Start", href: "/signup" } },
        { name: "Pro", price: "$19", period: "/month", features: ["A", "B"], cta: { label: "Start", href: "/signup?plan=pro" }, highlighted: true },
      ]} />
    )
    expect(html).toContain('aria-label="Start with Free"')
    expect(html).toContain('aria-label="Start with Pro"')
    expect((html.match(/Most popular/g) ?? []).length).toBe(1)
    expect(html).toContain("/month")
  })
})

describe("Faq", () => {
  test("renders one item per question and FAQPage JSON-LD for string answers only", () => {
    const html = renderToStaticMarkup(
      <Faq heading={{ title: "FAQ" }} jsonLd items={[{ question: "Q1?", answer: "A1" }, { question: "Q2?", answer: <p>Rich</p> }]} />
    )
    expect((html.match(/Q[12]\?/g) ?? []).length).toBeGreaterThanOrEqual(2)
    const ld = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1]
    expect(ld).toBeTruthy()
    const parsed = JSON.parse(ld ?? "{}")
    expect(parsed["@type"]).toBe("FAQPage")
    expect(parsed.mainEntity).toHaveLength(1)
    expect(parsed.mainEntity[0].name).toBe("Q1?")
  })
})

describe("Newsletter", () => {
  test("is a real form with a named email field, a submit button and prefixed feedback ids", () => {
    const html = renderToStaticMarkup(
      <Newsletter heading={{ title: "Stay in the loop" }} action={() => {}} state={{ ok: false, fieldErrors: { email: "Enter a valid email" } }} />
    )
    expect(html).toMatch(/<form[^>]*>/)
    expect(html).toContain('name="email"')
    expect(html).toContain('type="submit"')
    expect(html).toContain('id="newsletter-email-error"')
    expect(html).toContain('aria-describedby="newsletter-email-error"')
    expect(html).toContain('role="status"')
  })
})

describe("LegalPage", () => {
  test("renders a contents nav whose links match the section ids", () => {
    const html = renderToStaticMarkup(
      <LegalPage title="Terms" updatedAt="2026-10-02" sections={[{ id: "acceptance", title: "Acceptance", paragraphs: ["p1"] }, { id: "contact", title: "Contact", paragraphs: ["p2"] }]} notice={<span>Template</span>} />
    )
    expect(html).toContain('<nav aria-label="Contents"')
    expect(html).toContain('href="#acceptance"')
    expect(html).toContain('id="acceptance"')
    expect(html).toContain('href="#contact"')
    expect(html).toContain("Template")
    expect(html).toMatch(/Last updated/)
  })
})
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**

`pricing.tsx`: section + `SectionHeading`; tiers in a `md:grid-cols-{n}` grid (n = min(tiers.length, 3)); each tier a `<div className={cn("relative flex flex-col rounded-xl border p-6", highlighted && "ring-2 ring-primary")}>` with `{highlighted && <Badge className="absolute -top-3 left-6">Most popular</Badge>}` (`@repo/ui/components/badge`), `<h3 className="font-semibold">{name}</h3>`, price line `<p><span className="font-semibold text-4xl">{price}</span>{period && <span className="text-muted-foreground"> {period}</span>}</p>`, description, `<ul className="flex flex-col gap-2 text-sm">` of features with a `lucide:check` `Icon` (`aria-hidden`), and `<Button asChild variant={highlighted ? "default" : "outline"} className="mt-auto"><a href={cta.href} aria-label={\`${cta.label} with ${name}\`}>{cta.label}</a></Button>`; `note` under the grid in muted text.

`faq.tsx`:
```tsx
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@repo/ui/components/accordion"
import { cn } from "@repo/ui/lib/utils"
import { type ReactNode, useId } from "react"
import { SectionHeading, type SectionHeadingProps } from "../components/section-heading"

export type FaqItem = { question: string; answer: ReactNode }

/** Structured data only for string answers — rich answers have no clean text form. */
function faqJsonLd(items: FaqItem[]) {
  const entity = items
    .filter((i): i is { question: string; answer: string } => typeof i.answer === "string")
    .map((i) => ({ "@type": "Question", name: i.question, acceptedAnswer: { "@type": "Answer", text: i.answer } }))
  return JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: entity })
}

export function Faq({ heading, items, jsonLd = false, id, className }: { heading: SectionHeadingProps; items: FaqItem[]; jsonLd?: boolean; id?: string; className?: string }) {
  const headingId = useId()
  return (
    <section id={id} aria-labelledby={headingId} className={cn("container max-w-3xl py-20", className)}>
      <SectionHeading {...heading} id={headingId} />
      <Accordion type="single" collapsible className="mt-10">
        {items.map((item, i) => (
          <AccordionItem key={item.question} value={`item-${i}`}>
            <AccordionTrigger>{item.question}</AccordionTrigger>
            <AccordionContent>{item.answer}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      {jsonLd && (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON.stringify output of our own typed data, no user HTML
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd(items).replace(/</g, "\\u003c") }} />
      )}
    </section>
  )
}
```
(`Accordion` is a client component; importing it from a server-rendered block is fine — check the test renders with `renderToStaticMarkup`; if Radix's accordion needs a client boundary for the test, add `"use client"` to `faq.tsx` and note it.)

`newsletter.tsx`:
```tsx
import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, type FormState, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { cn } from "@repo/ui/lib/utils"
import { type ReactNode, useId } from "react"
import { SectionHeading, type SectionHeadingProps } from "../components/section-heading"

export function Newsletter({ heading, action, state, buttonLabel = "Join the waitlist", legal, idPrefix = "newsletter-", id, className }: {
  heading: SectionHeadingProps
  action: (formData: FormData) => void | Promise<void>
  state: FormState
  buttonLabel?: string
  legal?: ReactNode
  idPrefix?: string
  id?: string
  className?: string
}) {
  const headingId = useId()
  const inputId = `${idPrefix}email`
  return (
    <section id={id} aria-labelledby={headingId} className={cn("container max-w-2xl py-20 text-center", className)}>
      <SectionHeading {...heading} id={headingId} />
      <form action={action} noValidate className="mx-auto mt-8 flex max-w-md flex-col gap-3">
        <FormMessage state={state} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1 text-left">
            <Label htmlFor={inputId} className="sr-only">Email</Label>
            <Input id={inputId} name="email" type="email" autoComplete="email" placeholder="you@example.com" required defaultValue={state.ok ? "" : state.values?.email} {...fieldAria("email", state, undefined, { idPrefix })} />
          </div>
          <Button type="submit">{buttonLabel}</Button>
        </div>
        <FieldError name="email" state={state} idPrefix={idPrefix} />
        {legal && <p className="text-muted-foreground text-xs">{legal}</p>}
      </form>
    </section>
  )
}
```
Check `fieldAria`'s actual signature in `form-feedback.tsx` (6b added `idPrefix`; match how it is passed — positional options object or named param).

`legal-page.tsx`: `<article className="container max-w-3xl py-16">` with `<h1>`, `<p>Last updated <time dateTime={updatedAt}>{formatted}</time></p>` (format `new Date(updatedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })`), `{notice && <div role="note" className="my-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm dark:…">{notice}</div>}`, `<nav aria-label="Contents"><ol>` of `<a href={`#${id}`}>`, then sections `<section key id><h2 id={id}>{title}</h2>{paragraphs.map(p => <p>)}</section>`. Export `type LegalSection = { id: string; title: string; paragraphs: string[] }`.

- [ ] **Step 4: Stories** — `Pricing` (three tiers, middle highlighted; play: `getByRole("link", { name: "Start with Pro" })`), `Faq` (play: click the first trigger, expect the answer visible; second click collapses), `Newsletter` (args `state: { ok: false }`, `action: fn()`; a second story `WithError`; play: `getByRole("button", { name: "Join the waitlist" })` and `getByLabelText("Email")`), `LegalPage` (play: `getByRole("navigation", { name: "Contents" })`).

- [ ] **Step 5: README** — `packages/ui/src/blocks/README.md`: list all blocks with one line each, the composition rules (section root, `SectionHeading`, plain links, no fetching), "the app owns the action" for `Newsletter`, and that `www`'s home is the reference composition.

- [ ] **Step 6: Verify + commit**
Run: `bun test packages/ui && bun run --filter @repo/ui typecheck && cd apps/story && bunx vitest run --project=storybook stories/Pricing.stories.tsx stories/Faq.stories.tsx stories/Newsletter.stories.tsx stories/LegalPage.stories.tsx`
```bash
bunx biome check --write packages/ui apps/story
git add packages/ui apps/story
git commit -m "feat(ui): landing blocks II — Pricing, Faq (JSON-LD), Newsletter, LegalPage"
```

---

### Task 3: Cookie consent

**Files:**
- Create: `packages/ui/src/lib/consent.ts`, `consent.test.ts`, `packages/ui/src/components/cookie-consent.tsx`, `use-consent.ts`, story `CookieConsent.stories.tsx`
- Modify: `packages/ui/src/components/web-vitals.tsx` (`consent?` prop)

**Interfaces:**
- Produces: `CONSENT_COOKIE = "consent"`, `type Consent = "all" | "necessary"`, `parseConsent(cookieHeader: string | null | undefined): Consent | null`, `consentCookie(value: Consent, opts: { domain?: string; secure: boolean }): string` (a full `Set-Cookie`/`document.cookie` string), `CONSENT_MAX_AGE = 15_552_000`; `CookieConsent({ domain?, privacyHref, initial?: Consent | null })`; `useConsent(): Consent | null`; `WebVitals({ consent? })`.

- [ ] **Step 1: Failing tests** (`consent.test.ts`):
```ts
import { describe, expect, test } from "bun:test"
import { consentCookie, parseConsent } from "./consent"

describe("parseConsent", () => {
  test("finds the value among other cookies and ignores garbage", () => {
    expect(parseConsent("session=abc; consent=all; theme=dark")).toBe("all")
    expect(parseConsent("consent=necessary")).toBe("necessary")
    expect(parseConsent("consent=yes")).toBeNull()
    expect(parseConsent("notconsent=all")).toBeNull()
    expect(parseConsent("")).toBeNull()
    expect(parseConsent(null)).toBeNull()
    expect(parseConsent("consent = all ;x=1")).toBe("all")
  })
})

describe("consentCookie", () => {
  test("serialises with domain, path, max-age, SameSite and Secure in production", () => {
    const c = consentCookie("all", { domain: ".brand.localhost", secure: false })
    expect(c).toContain("consent=all")
    expect(c).toContain("Domain=.brand.localhost")
    expect(c).toContain("Path=/")
    expect(c).toContain("Max-Age=15552000")
    expect(c).toContain("SameSite=Lax")
    expect(c).not.toContain("Secure")
    expect(consentCookie("necessary", { secure: true })).toContain("Secure")
    expect(consentCookie("necessary", { secure: true })).not.toContain("Domain=")
  })
})
```

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**

`consent.ts`:
```ts
export const CONSENT_COOKIE = "consent"
export const CONSENT_MAX_AGE = 15_552_000 // 180 days
export type Consent = "all" | "necessary"

/** Reads the consent cookie out of a Cookie header; anything unexpected is "no choice yet". */
export function parseConsent(cookieHeader: string | null | undefined): Consent | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.split("=")
    if (name?.trim() !== CONSENT_COOKIE) continue
    const value = rest.join("=").trim()
    return value === "all" || value === "necessary" ? value : null
  }
  return null
}

/** The cookie string the banner writes (also valid as a Set-Cookie value). */
export function consentCookie(value: Consent, { domain, secure }: { domain?: string; secure: boolean }): string {
  const parts = [`${CONSENT_COOKIE}=${value}`, "Path=/", `Max-Age=${CONSENT_MAX_AGE}`, "SameSite=Lax"]
  if (domain) parts.push(`Domain=${domain}`)
  if (secure) parts.push("Secure")
  return parts.join("; ")
}
```
`use-consent.ts` (`"use client"`): `useConsent()` → `useSyncExternalStore` over `document.cookie` with a module-level event target `consentChanged` the banner dispatches after writing; server snapshot `null`.
`cookie-consent.tsx` (`"use client"`):
```tsx
export function CookieConsent({ domain, privacyHref, initial }: { domain?: string; privacyHref: string; initial?: Consent | null }) {
  const [choice, setChoice] = useState<Consent | null | undefined>(initial)
  useEffect(() => {
    if (initial === undefined) setChoice(parseConsent(document.cookie))
  }, [initial])
  if (choice !== null) return null // undefined = not yet read on the client; null = no choice
  const decide = (value: Consent) => {
    document.cookie = consentCookie(value, { domain, secure: location.protocol === "https:" })
    setChoice(value)
    notifyConsentChanged()
  }
  return (
    <section role="region" aria-label="Cookie consent" className="fixed inset-x-0 bottom-0 z-50 border-t bg-background p-4 shadow-lg motion-safe:animate-in motion-safe:slide-in-from-bottom">
      <div className="container flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">We use cookies for sign-in and, if you allow it, to understand how the site is used. <a href={privacyHref} className="underline underline-offset-4">Privacy</a></p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => decide("all")}>Accept all</Button>
          <Button size="sm" variant="outline" onClick={() => decide("necessary")}>Necessary only</Button>
        </div>
      </div>
    </section>
  )
}
```
Careful with the `undefined`/`null` states: render nothing while `undefined` (prevents the flash when the server passed `initial`; the static apps pass nothing and read after mount). `web-vitals.tsx`: `WebVitals({ consent }: { consent?: Consent | null })` — unchanged behaviour; the comment: "Production reporting (Phase 5 item) must check `consent === 'all'` before sending anything identifying."

- [ ] **Step 4: Story** — `Components/CookieConsent`: `Default` (no initial, play: click **Accept all** → banner gone and `document.cookie` contains `consent=all`), `NecessaryOnly` (play clicks the other button), `AlreadyDecided` (`initial: "all"` renders nothing). Reset `document.cookie` at the start of each play (`document.cookie = "consent=; Max-Age=0; Path=/"`).

- [ ] **Step 5: Verify + commit**
Run: `bun test packages/ui && bun run --filter @repo/ui typecheck && cd apps/story && bunx vitest run --project=storybook stories/CookieConsent.stories.tsx`
```bash
bunx biome check --write packages/ui apps/story
git add packages/ui apps/story
git commit -m "feat(ui): cookie consent banner and consent cookie helpers; WebVitals consent hook point"
```

---

### Task 4: OG images, sitemaps and robots for every app

**Files:**
- Create: `packages/ui/src/lib/og.tsx`, `og.test.tsx`; per app (`www`, `app`, `auth`, `account`, `docs`, `help`, `jobs`): `src/app/opengraph-image.tsx`, `src/app/twitter-image.tsx`, `src/lib/routes.ts`; `apps/www/src/lib/routes.test.ts`
- Modify: every app's `src/app/sitemap.ts` and `robots.ts`; `apps/www/src/app/layout.tsx` (`metadata.openGraph`/`twitter`); `packages/ui/package.json` exports if `lib/*` is not already a wildcard export (check)

**Interfaces:**
- Produces: `OG_SIZE = { width: 1200, height: 630 }`, `ogImage({ title, subtitle?, brand? }): ImageResponse`; per app `PUBLIC_ROUTES: readonly string[]`, `sitemapFor(id: SiteId, routes: readonly string[], env?) → MetadataRoute.Sitemap` and `robotsFor(id, { disallow?: string[] }, env?) → MetadataRoute.Robots` in `@repo/sites` (new exports, with tests) so every app's `sitemap.ts`/`robots.ts` is two lines.

- [ ] **Step 1: Failing tests**

`packages/sites/src/index.test.ts` (append):
```ts
test("sitemapFor and robotsFor use the site domain", () => {
  const env = { SITE_DOMAIN: "example.com" }
  const map = sitemapFor("www", ["/", "/terms"], env)
  expect(map.map((e) => e.url)).toEqual(["https://www.example.com/", "https://www.example.com/terms"])
  const robots = robotsFor("auth", { disallow: ["/oauth/", "/magic"] }, env)
  expect(robots.sitemap).toBe("https://auth.example.com/sitemap.xml")
  expect(robots.rules).toEqual([{ userAgent: "*", allow: "/", disallow: ["/oauth/", "/magic"] }])
  expect(sitemapFor("www", ["/"], {})[0]?.url).toBe("http://www.brand.localhost:3000/")
})
```
`packages/ui/src/lib/og.test.tsx`:
```tsx
import { expect, test } from "bun:test"
import { OG_SIZE, ogElement } from "./og"
import { renderToStaticMarkup } from "react-dom/server"

test("ogElement renders the title, subtitle and brand at the OG size", () => {
  const html = renderToStaticMarkup(ogElement({ title: "Docs", subtitle: "Read it", brand: "Acme" }))
  expect(html).toContain("Docs")
  expect(html).toContain("Read it")
  expect(html).toContain("Acme")
  expect(OG_SIZE).toEqual({ width: 1200, height: 630 })
})
```
(`ogImage` wraps `ogElement` in `ImageResponse`; the element is what the test pins — `next/og`'s renderer needs the Next runtime. The route itself is checked in the build and browser pass.)

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**

`packages/sites/src/index.ts` (append):
```ts
export function sitemapFor(id: SiteId, routes: readonly string[], env: Record<string, string | undefined> = process.env) {
  const base = siteUrl(id, env)
  const lastModified = new Date()
  return routes.map((route) => ({ url: `${base}${route}`, lastModified }))
}

export function robotsFor(id: SiteId, { disallow = [] }: { disallow?: string[] } = {}, env: Record<string, string | undefined> = process.env) {
  return {
    rules: [{ userAgent: "*", allow: "/", ...(disallow.length ? { disallow } : {}) }],
    sitemap: `${siteUrl(id, env)}/sitemap.xml`,
  }
}
```
(Return types structurally match `MetadataRoute.Sitemap` / `MetadataRoute.Robots`; `@repo/sites` must not import `next` — keep them untyped-against-next and let the app files annotate. Adjust the robots test to match the exact object you return if `disallow` is omitted when empty.)

`packages/ui/src/lib/og.tsx`:
```tsx
import { ImageResponse } from "next/og"

export const OG_SIZE = { width: 1200, height: 630 } as const

/** The element the OG image is rendered from; kept separate so it is testable without next/og's renderer. */
export function ogElement({ title, subtitle, brand = "Boilerplate" }: { title: string; subtitle?: string; brand?: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#0a0a0a", color: "#fafafa", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 32, fontWeight: 600 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ width: 10, height: 36, background: "#fafafa", borderRadius: 2 }} />
          <div style={{ width: 10, height: 36, background: "#fafafa", borderRadius: 2, opacity: 0.7 }} />
          <div style={{ width: 10, height: 36, background: "#fafafa", borderRadius: 2, opacity: 0.4 }} />
        </div>
        {brand}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 72, fontWeight: 700, letterSpacing: -2, lineHeight: 1.05 }}>{title}</div>
        {subtitle && <div style={{ fontSize: 32, opacity: 0.75 }}>{subtitle}</div>}
      </div>
    </div>
  )
}

export function ogImage(props: Parameters<typeof ogElement>[0]) {
  return new ImageResponse(ogElement(props), OG_SIZE)
}
```
`packages/ui/package.json`: make sure `./lib/og` resolves (there is likely a `"./lib/*"` export; `next` must be resolvable from `packages/ui` — it is a dependency of the apps, and `packages/ui` already imports `next/font` / `next/web-vitals`, so it is declared; confirm).

Per app: `src/lib/routes.ts` → `export const PUBLIC_ROUTES = ["/", "/terms", "/privacy"] as const` (www); auth `["/login", "/signup", "/forgot-password"]`; the other five `["/"]`. `src/app/sitemap.ts`:
```ts
import { sitemapFor } from "@repo/sites"
import type { MetadataRoute } from "next"
import { PUBLIC_ROUTES } from "@/lib/routes"
export default function sitemap(): MetadataRoute.Sitemap { return sitemapFor("www", PUBLIC_ROUTES) }
```
`robots.ts` likewise with `robotsFor("auth", { disallow: ["/oauth/", "/magic", "/verify-email", "/reset-password"] })` on auth, `{ disallow: ["/api/"] }` on app and account, none elsewhere. `opengraph-image.tsx`:
```tsx
import { OG_SIZE, ogImage } from "@repo/ui/lib/og"
export const dynamic = "force-static" // omit on app/auth/account — their layouts are dynamic anyway
export const size = OG_SIZE
export const contentType = "image/png"
export const alt = "Boilerplate — <app title>"
export default function Image() { return ogImage({ title: "<App title>", subtitle: "<one line>" }) }
```
`twitter-image.tsx`: `export { default, size, contentType, alt } from "./opengraph-image"` (if Next refuses re-exported route segment config, duplicate the five lines). Titles: www "Boilerplate" / "Build faster with this monorepo template"; app "App"; auth "Sign in"; account "Account"; docs "Docs"; help "Help"; jobs "Jobs". `apps/www/src/app/layout.tsx` `metadata`: add `metadataBase: new URL(siteUrl("www"))`, `openGraph: { type: "website", siteName: "Boilerplate", title: "Boilerplate", description }`, `twitter: { card: "summary_large_image" }` (image paths are picked up from the route files automatically).

- [ ] **Step 4: Verify** — `bun test packages/sites packages/ui && bun run typecheck && for a in www docs help jobs app auth account; do bun --filter @repo/$a build || exit 1; done`; in each build output, confirm `/opengraph-image` and `/sitemap.xml` appear (www's as `○`). Then `curl -s -o /tmp/og.png -w "%{http_code} %{content_type}\n" http://localhost:<port>/opengraph-image` against one `next start` of www (`bun --filter @repo/www start` on 3000 after the build) → `200 image/png`, and `file /tmp/og.png` → 1200 x 630. Stop the server.

- [ ] **Step 5: Commit**
```bash
bunx biome check --write packages apps
git add packages/sites packages/ui apps
git commit -m "feat(sites,ui,apps): OG images from one renderer; sitemaps and robots from the sites registry"
```

---

### Task 5: Waitlist in `apps/api` + welcome mail

**Files:**
- Create: `apps/api/src/migrations/0007_waitlist.ts`, `apps/api/src/queries/waitlist.ts`, `packages/email/src/templates/waitlist-welcome.tsx`, story `Email/WaitlistWelcome`
- Modify: `apps/api/src/migrations/index.ts`, `db.ts`, `router.ts`, `server.ts` (`waitlistLimiter`, `Context.clientId`), `packages/api-contract/src/index.ts` (+ a `waitlist.ts` schema file), `packages/email/src/index.tsx` (+ test), `apps/api/src/auth.test.ts` or a new `waitlist.test.ts`, `queries.test.ts`, `migrate.test.ts`, `test-server.ts` (`start({ waitlistLimiter })`)

**Interfaces:**
- Produces: `WaitlistJoinSchema = z.object({ email: EmailSchema, source: z.enum(["www","app","docs","help","jobs"]).default("www") })`, `WaitlistJoinResultSchema = z.object({ joined: z.literal(true) })`; `client.waitlist.join({ email, source? }) → { joined: true }` (errors `TOO_MANY_REQUESTS`); `db.waitlist.add({ email, source }) → { created: boolean }`, `find(email) → { email, source, created_at } | undefined`, `count()`; `Context.wwwUrl: string` (`siteUrl("www")` computed once in `createServer`); `emails.waitlistWelcome({ brand?, siteUrl })`, `waitlistWelcomeSubject = "You're on the list"`; `Context.clientId: string | null` (the `x-api-client-id` header, trimmed, ≤128 chars, else null).

- [ ] **Step 1: Failing tests** (`apps/api/src/waitlist.test.ts`):
```ts
describe("waitlist.join", () => {
  test("a new email joins, is stored once and gets the welcome mail; a repeat answers alike with no second mail", async () => {
    const anon = clientFor(app)
    expect(await anon.waitlist.join({ email: "Ada@Example.com " })).toEqual({ joined: true })
    const [mail] = await mailsTo(app.mailer, "ada@example.com", waitlistWelcomeSubject)
    expect(mail.text).toContain("http://www.")
    expect(await anon.waitlist.join({ email: "ada@example.com" })).toEqual({ joined: true })
    await Bun.sleep(50)
    expect(app.mailer.sent.filter((m) => m.to === "ada@example.com" && m.subject === waitlistWelcomeSubject)).toHaveLength(1)
    expect(await app.db.waitlist.count()).toBe(1)
  })

  test("source defaults to www and is stored", async () => {
    await clientFor(app).waitlist.join({ email: "default@example.com" })
    await clientFor(app).waitlist.join({ email: "src@example.com", source: "docs" })
    expect((await app.db.waitlist.find("default@example.com"))?.source).toBe("www")
    expect((await app.db.waitlist.find("src@example.com"))?.source).toBe("docs")
  })

  test("the limiter trips on the 6th call from one client", async () => {
    const own = await start({ waitlistLimiter: createMemoryRateLimiter({ limit: 5, windowMs: 60_000 }) })
    try {
      const c = clientFor(own) // clientFor sends a fixed x-api-client-id? — read test-server.ts; if not, add a header option
      for (let i = 0; i < 5; i++) await c.waitlist.join({ email: `w${i}@example.com` })
      const [err] = await safe(c.waitlist.join({ email: "w6@example.com" }))
      expect(err).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    } finally { await own.stop() }
  })

  test("an invalid email is BAD_REQUEST and stores nothing", async () => {
    const [err] = await safe(clientFor(app).waitlist.join({ email: "nope" }))
    expect(err).toMatchObject({ code: "BAD_REQUEST" })
  })
})
```
`queries.test.ts`: `waitlist.add` returns `created: true` then `false` for the same normalised email; `count()`. `migrate.test.ts`: `0007` creates `waitlist` with the unique email. `packages/email` test: subject, link, no tags.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**

Migration:
```ts
const waitlist: Migration = {
  name: "0007_waitlist",
  async up(sql, dialect) {
    await sql.unsafe(`
      CREATE TABLE waitlist (
        id ${ddl.serialId(dialect)},
        email TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL DEFAULT 'www',
        created_at TEXT NOT NULL
      )
    `)
  },
}
```
`queries/waitlist.ts`:
```ts
const isDuplicate = (error: unknown) => error instanceof Error && /UNIQUE constraint failed: waitlist\.email|waitlist_email_key/.test(error.message)
export function waitlistQueries(sql: SQL) {
  return {
    async add(input: { email: string; source: string }): Promise<{ created: boolean }> {
      try {
        await sql`INSERT INTO waitlist (email, source, created_at) VALUES (${normalizeEmail(input.email)}, ${input.source}, ${new Date().toISOString()})`
        return { created: true }
      } catch (error) {
        if (isDuplicate(error)) return { created: false }
        throw error
      }
    },
    async find(email: string): Promise<{ email: string; source: string; created_at: string } | undefined> {
      const [row] = await sql`SELECT email, source, created_at FROM waitlist WHERE email = ${normalizeEmail(email)}`
      return row
    },
    async count(): Promise<number> {
      const [row]: Array<{ n: number | string }> = await sql`SELECT COUNT(*) AS n FROM waitlist`
      return Number(row?.n ?? 0)
    },
  }
}
```
Contract (`packages/api-contract/src/waitlist.ts` + export from index; route `POST /waitlist`, summary "Join the waitlist", errors `TOO_MANY_REQUESTS: { message: "Too many requests, try again in a few minutes" }`). Router:
```ts
  waitlist: {
    join: api.waitlist.join.handler(async ({ input, context, errors }) => {
      const limit = await context.waitlistLimiter.hit(`waitlist:${context.clientId ?? "unknown"}`)
      if (!limit.allowed) throw errors.TOO_MANY_REQUESTS()
      const { created } = await context.db.waitlist.add(input)
      if (created) {
        const to = normalizeEmail(input.email)
        detach(async () => {
          const mail = await emails.waitlistWelcome({ siteUrl: context.wwwUrl })
          await context.mailer.send({ to, ...mail })
          context.log(`mail sent waitlist-welcome to ${maskEmail(to)}`, undefined)
        }, (error) => context.log("waitlist-welcome mail failed", error))
      }
      return { joined: true as const }
    }),
  },
```
`context.wwwUrl` = `siteUrl("www")` computed once in `createServer` (api already depends on `@repo/sites`; `SITE_DOMAIN` reaches the api through the environment in production — document in `.env.example`/Compose that the api reads `SITE_DOMAIN` for links in mail). `server.ts`: `waitlistLimiter` default 5 / 15 min; `Context.clientId` from `req.headers.get("x-api-client-id")?.trim().slice(0, 128) || null`. `test-server.ts`: `clientFor` must send a stable `x-api-client-id` (e.g. `"test-client"`) — check `createORPCClient`'s headers and add it if missing. Template `waitlist-welcome.tsx`: heading "You're on the list", one paragraph "Thanks for your interest — we'll email you when there is news.", link to `siteUrl`, ignore line.

- [ ] **Step 4: Verify** — `bun test apps/api packages/api-contract packages/email && bun --filter @repo/api test:postgres && bun run --filter @repo/api typecheck && cd apps/story && bunx vitest run --project=storybook stories/email`.

- [ ] **Step 5: Commit**
```bash
bunx biome check --write apps/api packages/api-contract packages/email apps/story
git add apps/api packages/api-contract packages/email apps/story
git commit -m "feat(api,email): waitlist.join — deduped, rate-limited, with a welcome mail"
```

---

### Task 6: `apps/www` — env, api client, waitlist action, content, home, legal pages, consent

**Files:**
- Create: `apps/www/src/instrumentation.ts`, `src/lib/api.ts`, `src/lib/actions.ts`, `src/lib/actions.test.ts`, `src/app/actions.ts`, `src/components/waitlist-form.tsx`, `src/content/home.tsx` (TSX: icons/nodes), `src/content/terms.ts`, `src/content/privacy.ts`, `src/app/terms/page.tsx`, `src/app/privacy/page.tsx`
- Modify: `apps/www/package.json` (+ `@repo/session`, `@repo/api-contract`, `@repo/email`? no — only session + api-contract), `next.config.*` (`transpilePackages`), `src/views/home-view.tsx`, `src/app/layout.tsx` (`CookieConsent`), `apps/www/README.md`, `.env.example` entries for www
- Modify: `packages/session/src/env.ts` (+ `assertEnv(keys)`), `packages/session/src/index.ts` (+ export `requestInfo` moved from `apps/auth/src/lib/request-info.ts`, tests moved to `packages/session/src/request-info.test.ts`; `apps/auth` imports it from `@repo/session`)

**Interfaces:**
- Consumes: `Newsletter`, `LegalPage`, the other blocks; `client.waitlist.join`; `createApiClient`, `anonymousClientId`, `loadEnv` from `@repo/session`.
- Produces: `assertEnv(keys: readonly AuthEnvKey[], source?)` in `@repo/session/env`; `requestInfo(headers: Headers)` exported from `@repo/session`; `joinWaitlistCore({ api }, fd) → FormState`.

- [ ] **Step 1: Failing tests**

`apps/www/src/lib/actions.test.ts`:
```ts
import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { GENERIC_FAILURE, JOINED, joinWaitlistCore } from "./actions"

const fd = (email: string) => { const f = new FormData(); f.set("email", email); return f }

describe("joinWaitlistCore", () => {
  test("invalid email is a field error without calling the api", async () => {
    let calls = 0
    const out = await joinWaitlistCore({ api: { join: async () => { calls++; return { joined: true as const } } } }, fd("nope"))
    expect(out).toMatchObject({ ok: false, fieldErrors: { email: expect.any(String) } })
    expect(calls).toBe(0)
  })
  test("success message", async () => {
    expect(await joinWaitlistCore({ api: { join: async () => ({ joined: true as const }) } }, fd("ada@example.com"))).toEqual({ ok: true, message: JOINED })
  })
  test("the limiter's message passes through; anything else is generic", async () => {
    const limited = new ORPCError("TOO_MANY_REQUESTS", { defined: true, message: "Too many requests, try again in a few minutes" })
    expect(await joinWaitlistCore({ api: { join: async () => { throw limited } } }, fd("a@example.com"))).toEqual({ ok: false, message: limited.message, values: { email: "a@example.com" } })
    expect(await joinWaitlistCore({ api: { join: async () => { throw new Error("down") } } }, fd("a@example.com"))).toEqual({ ok: false, message: GENERIC_FAILURE, values: { email: "a@example.com" } })
  })
})
```
`packages/session/src/env.test.ts`: `assertEnv(["API_URL","API_SERVICE_TOKEN"], { NODE_ENV: "production" })` throws naming `API_URL`; with both set it returns; outside production it returns without checking. Move `request-info.test.ts` with the function.

- [ ] **Step 2: Run to verify they fail.**

- [ ] **Step 3: Implement**

`packages/session/src/env.ts`: `export function assertEnv<K extends keyof AuthEnv>(keys: readonly K[], source = process.env) { if (source.NODE_ENV !== "production") return; loadEnv(keys, source) }`; keep `assertAuthEnv` as `assertEnv(AUTH_ENV_KEYS)`. Move `requestInfo` to `packages/session/src/request-info.ts`, export from `index.ts`; `apps/auth` updates its imports and deletes its copy (+ test).

`apps/www`: `package.json` deps `+ "@repo/session": "workspace:*", "@repo/api-contract": "workspace:*"`; `transpilePackages` += both. `src/instrumentation.ts`:
```ts
import { assertEnv } from "@repo/session/env"
export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") assertEnv(["API_URL", "API_SERVICE_TOKEN"])
}
```
`src/lib/api.ts`:
```ts
import { anonymousClientId, createApiClient, loadEnv } from "@repo/session"
let env: ReturnType<typeof loadEnv<"API_URL" | "API_SERVICE_TOKEN">> | undefined
export async function anonymousApi(ip?: string) {
  env ??= loadEnv(["API_URL", "API_SERVICE_TOKEN"])
  return createApiClient({ apiUrl: env.API_URL, serviceToken: env.API_SERVICE_TOKEN, clientId: await anonymousClientId(ip) })
}
```
(Check `createApiClient`'s option names in `packages/session/src/client.ts` and whether `loadEnv` generics read like that; adapt.)
`src/lib/actions.ts`:
```ts
export const JOINED = "You're on the list — check your inbox."
export const GENERIC_FAILURE = "Something went wrong, try again later."
export type WaitlistApi = Pick<ApiClient["waitlist"], "join">
export async function joinWaitlistCore(deps: { api: WaitlistApi }, fd: FormData): Promise<FormState> {
  const raw = fd.get("email"); const email = typeof raw === "string" ? raw : ""
  const parsed = WaitlistJoinSchema.safeParse({ email, source: "www" })
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error.issues), values: { email } }
  try {
    await deps.api.join(parsed.data)
    return { ok: true, message: JOINED }
  } catch (error) {
    const known = error instanceof ORPCError && error.defined && error.code === "TOO_MANY_REQUESTS" ? error.message : undefined
    if (!known) console.error("[www] waitlist join failed", error)
    return { ok: false, message: known ?? GENERIC_FAILURE, values: { email } }
  }
}
```
`src/app/actions.ts` (`"use server"`): `joinWaitlist(_prev, fd)` → `requestInfo(await headers()).ip` → `anonymousApi(ip)` → `joinWaitlistCore({ api: client.waitlist }, fd)`. Server actions reading `headers()` do not make the page dynamic (the action runs per POST). `src/components/waitlist-form.tsx` (`"use client"`): `useActionState(joinWaitlist, { ok: false })` → `<Newsletter heading={…} action={action} state={state} legal="No marketing without a separate opt-in. Unsubscribe any time." />` (heading/copy from content).

Content: `src/content/home.tsx` exporting `home = { hero: { eyebrow, title, description }, logos: Logo[] (six inline `<svg>` wordmarks: simple text paths "Acme", "Globex", "Initech", "Umbrella", "Hooli", "Vandelay" rendered as `<svg viewBox="0 0 120 32"><text …>` — no third-party marks), features: Feature[] (six, using `<Icon icon="lucide:…"/>` from `@repo/ui/components/icon`: layers, shield-check, mail, git-branch, container, sparkles — run `bun icons:bundle` after), testimonials: [{ quote, name, role, avatar: { initials }, placeholder: true }×3], tiers: [Free $0 /forever, Pro $19 /month (highlighted), Team $49 /month] with features and ctas `${siteUrl("auth")}/signup?plan=<name>`, faq: six Q/A strings about the repo (what is included, how to rename, how auth works, how to deploy, can I remove apps, licence), cta: { title, description }, newsletter: { title, description } }`. Testimonial cards show an "Example" `Badge` when `placeholder` (the view adds it to `role`: `${role} · Example`). `terms.ts` / `privacy.ts`: `LegalSection[]` with the sections listed in the spec, `updatedAt: "2026-10-02"`, placeholders `[Company]`, `[Jurisdiction]`, `[Contact email]`.

`HomeView`: `<main id="main">` → `Hero` (actions: `Button asChild` **Open app** → `siteUrl("app")`, `variant="outline"` **Read the docs** → `siteUrl("docs")`) → `LogoCloud` → `FeatureGrid` → `Testimonials` → `Pricing` → `Faq jsonLd` → `Cta` (actions: **Create an account** → `${siteUrl("auth")}/signup`) → `WaitlistForm`. `/terms/page.tsx` and `/privacy/page.tsx`: `metadata = { title: "Terms" | "Privacy" }`, render `<main id="main"><LegalPage title updatedAt sections notice={NOTICE} /></main>` where `NOTICE` is the exact sentence from Global Constraints. Layout: `<CookieConsent domain={process.env.COOKIE_DOMAIN || (process.env.NODE_ENV === "production" ? undefined : ".brand.localhost")} privacyHref="/privacy" />` after the footer (client component; the static apps pass no `initial`).

- [ ] **Step 4: Verify** — `bun test apps/www packages/session apps/auth && bun run typecheck && bun --filter @repo/www build` and assert in the build output that every route is `○` (static) — `/`, `/terms`, `/privacy`, `/offline`, `/opengraph-image`, `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`; `bun run icons:bundle` if new lucide names were added (commit the bundle). `SITE_DOMAIN=example.com bun --filter @repo/www build && grep -c "https://auth.example.com/signup" apps/www/.next/server/app/index.html` → ≥ 1.

- [ ] **Step 5: README + env + commit** — `apps/www/README.md` (content files, legal placeholders, waitlist flow, env `API_URL`/`API_SERVICE_TOKEN`/optional `COOKIE_DOMAIN`), root `.env.example` (www reads `API_URL`/`API_SERVICE_TOKEN`; the api reads `SITE_DOMAIN` for mail links), `docker-compose.yml` www service env (`API_URL: http://api:3007`, `API_SERVICE_TOKEN: ${API_SERVICE_TOKEN:-}`, `COOKIE_DOMAIN: ${COOKIE_DOMAIN:-}`).
```bash
bunx biome check --write apps/www packages/session apps/auth
git add apps/www packages/session apps/auth .env.example docker-compose.yml packages/ui/src/lib/icon-bundle.ts
git commit -m "feat(www): demo landing page from one content file, /terms and /privacy, waitlist form, cookie consent"
```

---

### Task 7: Consent banner in the other six apps

**Files:**
- Modify: root layouts of `app`, `auth`, `account` (read the `consent` cookie via `cookies()`/`headers()` they already access — pass `initial={parseConsent((await headers()).get("cookie"))}`) and of `docs`, `help`, `jobs` (no `initial`); each gets `<CookieConsent domain={…} privacyHref={`${siteUrl("www")}/privacy`} />` after the footer. The three auth-aware apps take `domain` from `COOKIE_DOMAIN` (already loaded by `getAuth()`'s env — expose `cookieDomain` from `getAuth()` or read `loadEnv(["COOKIE_DOMAIN"])`); the static apps use the same expression as www.

- [ ] **Step 1: Implement** the six layout edits (batch; same shape).
- [ ] **Step 2: Verify** — `bun run typecheck && for a in docs help jobs app auth account; do bun --filter @repo/$a build || exit 1; done`; docs/help/jobs stay `○`.
- [ ] **Step 3: Commit**
```bash
bunx biome check --write apps
git add apps
git commit -m "feat(apps): cookie consent banner in every app's root layout"
```

---

### Task 8: Docs, ROADMAP, browser pass, full gate

**Files:**
- Modify: `CLAUDE.md`, `packages/ui/src/blocks/README.md` (if not already complete), `apps/api/README.md`, `docs/ROADMAP.md`, spec status

- [ ] **Step 1: Docs** — CLAUDE.md: **Blocks** bullet in Design System Single Points (the eight blocks + `SectionHeading`; `www` home as the reference composition; `CookieConsent` + `consent` cookie + `WebVitals.consent` hook point; `ogImage`/`OG_SIZE`; `sitemapFor`/`robotsFor` + `PUBLIC_ROUTES`); the new-app checklist (+ `opengraph-image.tsx`/`twitter-image.tsx`, `src/lib/routes.ts` + two-line sitemap/robots, `CookieConsent` in the layout); env table rows (www `API_URL`, `API_SERVICE_TOKEN`, optional `COOKIE_DOMAIN`; api reads `SITE_DOMAIN`); the Quality-gates sentence that counts blocks the apps import (recount). `apps/api/README.md`: `waitlist.join`, limiter, `x-api-client-id` key. ROADMAP: tick 6c; Phase 6 state (6a–6c done; 6d–6f pending owner decision). Spec status → implemented.
- [ ] **Step 2: Browser pass** (controller): www home renders all eight sections, zero console/CSP messages; waitlist: invalid email → field error; valid → success message and the api log shows the welcome mail; repeat → same message, no second mail; JS disabled (chrome-devtools `emulate` or a `curl -X POST` of the form) → still succeeds; `/terms` and `/privacy` render with a working TOC and the notice; consent banner once per browser, **Accept all** sets `consent=all` on `.brand.localhost`, banner hidden afterwards on www and on app; `/sitemap.xml`, `/robots.txt` on www and auth list the right hosts and disallows; `/opengraph-image` on www and auth → 1200×630 PNG; Lighthouse accessibility on www home ≥ 95.
- [ ] **Step 3: Gate** — `bun run ci` → exit 0; `bun --filter @repo/api test:postgres` → green.
- [ ] **Step 4: Commit**
```bash
git add CLAUDE.md packages/ui/src/blocks/README.md apps/api/README.md docs
git commit -m "docs(marketing): blocks, consent, OG and sitemap single points; Phase 6c done"
```
