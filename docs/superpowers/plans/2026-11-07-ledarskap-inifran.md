# Ledarskap inifrån Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new www track, "Ledarskap inifrån", with a hub page, four service pages and a research page, whose packages are bookable today through the existing booking system and carry prices computed from 1 500 kr/h.

**Architecture:** Six new `OfferingKey`s in the Zod-free contract catalog make every purchasable part bookable (and payable later). Group events gain an `offering` column so Inifrån-gruppen's events never mix with today's group coaching. www gets one bilingual content module for the track, a pure pricing module, and server views under `/inifran`, reusing the existing sections, `Picture`, `Reveal` and booking pages.

**Tech Stack:** Next.js 16 (www, auth), Bun + oRPC + `Bun.sql` (api), Zod contract, Biome, `bun test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-07-ledarskap-inifran-design.md`

## Global Constraints

- Swedish is the default, English the second language; every new string exists in both (`Record<Locale, …>`), same keys, no "!" in either.
- Copy rules (spec "Anti-mål"): no health/treatment promises; refer to "vården" when someone needs treatment; no claims about effects on the client's team; correlations worded as correlations; Sanskrit terms explained in everyday words on first use.
- Paths: `/inifran`, `/inifran/coachning`, `/inifran/mentorskap`, `/inifran/livsstil`, `/inifran/grupp`, `/inifran/forskning` (same in both languages).
- Offering keys (permanent once used): `inner_start_coaching`, `inner_start_mentoring`, `inner_start_lifestyle` (instant, 90 min), `inner_session` (instant, 60 min), `inner_mentoring_session` (instant, 90 min), `inner_group` (group, 120 min). Audiences `private` + `organisation`; locations `varberg` + `video`.
- Prices: 1 500 kr/h; discounts 0 % (single/start), 10 % (monthly), 15 % (three months prepaid); group 550 kr per person and hour. Amounts round to whole kronor (half up). Shown "inkl. moms" for private, "exkl. moms" for organisation, same amount.
- Certification line, exactly: sv "Certifierad yogalärare, registrerad hos Yoga Alliance (200 timmar), med 50 timmar fördjupning i yin yoga" / en "Certified yoga teacher, registered with Yoga Alliance (200 hours), with 50 hours of further training in yin yoga".
- No new dependencies. Every page reads without JavaScript; nothing scrolls sideways at 320 px; motion respects `prefers-reduced-motion`.
- Repo gates: `bunx biome ci .`, `bun run typecheck`, `bun test scripts`, www first-load JS within `perf/budgets.json`.

## Review Focus

1. A member key (`inner_session`) opened by URL must still render its booking page, while `/book` does not list it — someone following the link in a mail must not hit a 404.
2. `/book/inner_group` lists only `inner_group` events, and `/book/group` only `group` events; existing rows (before the migration) count as `group`.
3. Prices round to whole kronor and match the spec's table exactly (2 250, 2 700, 7 650, 2 025, 5 738, 1 980, 5 610); a change of the hourly rate moves every figure.
4. English pages show no Swedish and vice versa (proper nouns aside), including alt texts and button labels.
5. At 320 px the hub's service cards and the price table do not scroll sideways.

---

### Task 1: Contract — the new offerings and per-offering group events

**Files:**
- Modify: `packages/api-contract/src/booking-limits.ts` (`OFFERING_KEYS`, `OFFERINGS`, new `GROUP_OFFERING_KEYS`, `MEMBER_OFFERING_KEYS`)
- Modify: `packages/api-contract/src/booking.ts` (`GroupEventSchema.offering`, `booking.groupEvents` input, `AdminGroupEventCreateSchema.offering`)
- Modify: `packages/api-contract/src/index.ts` (`booking.groupEvents` route input)
- Test: `packages/api-contract/src/booking.test.ts` (create if absent)

**Interfaces:**
- Produces: `OFFERING_KEYS` including the six keys above; `GROUP_OFFERING_KEYS: readonly OfferingKey[]` (`["group", "inner_group"]`); `MEMBER_OFFERING_KEYS: readonly OfferingKey[]` (`["inner_session", "inner_mentoring_session"]`, hidden from the catalog); `GroupEvent.offering: OfferingKey`; `BookingGroupEventsSchema = z.object({ offering: GroupOfferingKeySchema.default("group") })`; `AdminGroupEventCreateSchema.offering: GroupOfferingKeySchema` defaulting to `"group"`.

- [ ] **Step 1: Write the failing tests** — `OFFERINGS.inner_start_coaching` has `kind "instant"`, `durationMinutes 90`, `sessions 1`; `OFFERINGS.inner_group.kind === "group"` and `durationMinutes 120`; `GROUP_OFFERING_KEYS` equals `["group", "inner_group"]`; `MEMBER_OFFERING_KEYS` equals `["inner_session", "inner_mentoring_session"]`; `BookingGroupEventsSchema.parse({})` gives `{ offering: "group" }`; `AdminGroupEventCreateSchema` refuses `offering: "session"`.
- [ ] **Step 2: Run** `bun test packages/api-contract` — expected FAIL (unknown keys).
- [ ] **Step 3: Implement** the keys and schemas. Labels (English, admin/internal mail): "Inner leadership: start (coaching)", "… start (mentoring)", "… start (lifestyle)", "Inner leadership session", "Mentoring session", "Inifrån group".
- [ ] **Step 4: Run** `bun test packages/api-contract` and `bun run --filter @repo/api-contract typecheck` — PASS.
- [ ] **Step 5: Commit** `feat(contract): offerings for Ledarskap inifrån and per-offering group events`

### Task 2: Api — store and filter group events per offering

**Files:**
- Create: `apps/api/src/migrations/0035_group_event_offering.ts` (`ALTER TABLE group_events ADD COLUMN offering TEXT NOT NULL DEFAULT 'group'` + index `(offering, status, starts_at)`); list it in `migrations/index.ts`
- Modify: `apps/api/src/queries/booking.ts` (`events.create` takes `offering`; `events.upcoming(nowIso, offering)` filters)
- Modify: `apps/api/src/router.ts` (`booking.groupEvents` passes `input.offering`; `booking.reserve` stores each seat with its event's `offering`; `admin.bookings.groupEvents.create` stores `input.offering`; `toGroupEvent` maps `offering`)
- Modify: `apps/api/src/booking/service.ts` (`toGroupEvent`)
- Test: `apps/api/src/booking.test.ts`, `apps/api/src/migrate.test.ts` (shipped list gains `"0035_group_event_offering"`)

**Interfaces:**
- Consumes: Task 1's schemas.
- Produces: `booking.groupEvents({ offering })` returns only that offering's scheduled future events; a seat's `bookings.offering` equals its event's offering.

- [ ] **Step 1: Write the failing test** `"group events are listed per offering"`: admin creates one `group` and one `inner_group` event; `booking.groupEvents({})` returns only the `group` one; `booking.groupEvents({ offering: "inner_group" })` only the other; reserving the `inner_group` event stores a booking with `offering "inner_group"`.
- [ ] **Step 2: Run** `cd apps/api && bun test src/booking.test.ts src/migrate.test.ts` — FAIL.
- [ ] **Step 3: Implement** the migration, queries and handlers.
- [ ] **Step 4: Run** the same command plus `bun --filter @repo/api typecheck` — PASS; then `bun --filter @repo/api test` — no regressions.
- [ ] **Step 5: Commit** `feat(api): group events belong to an offering`

### Task 3: Admin — choose the offering when scheduling a group event

**Files:**
- Modify: `apps/auth/src/components/admin/group-event-create-form.tsx` (a native select "Gruppcoachning / Inifrån-gruppen" — English admin labels "Group coaching / Inifrån group", values from `GROUP_OFFERING_KEYS`)
- Modify: `apps/auth/src/lib/admin-booking-actions.ts` (`createGroupEventCore` reads `offering`)
- Modify: `apps/auth/src/views/admin-booking-groups-view.tsx` (show each event's offering label)
- Test: `apps/auth/src/lib/admin-booking-actions.test.ts`

- [ ] **Step 1: Failing test** `"createGroupEventCore forwards the offering"`: form data with `offering=inner_group` → api called with `offering: "inner_group"`; missing → `"group"`.
- [ ] **Step 2: Run** `cd apps/auth && bun test src/lib/admin-booking-actions.test.ts` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun --filter @repo/auth test` and typecheck — PASS.
- [ ] **Step 5: Commit** `feat(auth): schedule Inifrån group events from the admin calendar`

### Task 4: www pricing module

**Files:**
- Create: `apps/www/src/content/inner-pricing.ts`, `apps/www/src/content/inner-pricing.test.ts`

**Interfaces:**
- Produces: `HOURLY_RATE = 1500`, `GROUP_HOURLY_RATE = 550`, `DISCOUNT = { single: 0, monthly: 0.1, quarter: 0.15 } as const`, `priceFor(hours: number, tier: keyof typeof DISCOUNT, rate = HOURLY_RATE): number` (rounded to whole kronor; `quarter` returns the three-month total), `INNER_PRICES: Record<InnerServiceId, { start?: number; monthly: number; quarter: number }>`, `formatKr(amount: number, locale: Locale): string` ("2 700 kr" in both languages, non-breaking space).

- [ ] **Step 1: Failing tests** with the spec's exact figures: start `2250`; coaching monthly `2700`, quarter `7650`; mentoring `2025` / `5738`; lifestyle `2700` / `7650`; group `1980` / `5610`; `priceFor(2, "monthly", 1000) === 1800`; `formatKr(2700, "sv") === "2 700 kr"`.
- [ ] **Step 2: Run** `bun test apps/www/src/content/inner-pricing.test.ts` — FAIL.
- [ ] **Step 3: Implement.** `InnerServiceId = "coaching" | "mentoring" | "lifestyle" | "group"`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(www): price model for Ledarskap inifrån`

### Task 5: www content — the track in two languages

**Files:**
- Create: `apps/www/src/content/inner.tsx` (`INNER: Record<Locale, InnerContent>`, `innerFor(locale)`), `apps/www/src/content/inner.test.ts`
- Modify: `apps/www/src/content/booking.tsx` (offering copy for the six keys, both languages; a `catalogGroups` field: leadership keys vs. inner keys, `MEMBER_OFFERING_KEYS` excluded)
- Modify: `apps/www/src/content/media.ts` (`OFFERING_MEDIA` for the six keys: start keys → `portraitPark`, `portraitOutdoors`, `sessionLounge`; member keys → `portraitStudy`, `portraitOffice`; `inner_group` → `workshopTable`)
- Modify: `apps/www/src/content/home.tsx` (education list gains the certification line; `NAV` gains `{ label: "Inifrån" | "From within", href: "/inifran" }`; a `inner` teaser block)

**Interfaces:**
- Consumes: Task 4 (`InnerServiceId`, `INNER_PRICES`).
- Produces: `InnerContent = { hub: InnerHub; services: Record<InnerServiceId, InnerService>; research: InnerResearch; labels: InnerLabels }`, where `InnerService = { slug: "coachning" | "mentorskap" | "livsstil" | "grupp"; title; lead; forWhom: string[]; outcomes: string[]; howItWorks: string[]; yoga: string; package: { start?: string; monthly: string; review: string }; startOffering?: OfferingKey; memberOffering?: OfferingKey; groupOffering?: OfferingKey; image: MediaKey; faq: FaqItem[] }` and `InnerResearch = { intro: string; findings: { claim: string; sources: number[] }[]; limits: string[]; references: { n: number; text: string; url: string }[] }` — the findings, limits and references taken from the spec's "Vad forskningen bär" and "Referenser".

- [ ] **Step 1: Failing tests** in `inner.test.ts`: sv and en have the same key structure (walk both objects); no string contains "!"; every service's `startOffering`/`memberOffering`/`groupOffering` is in `OFFERING_KEYS`; every research finding cites at least one existing reference number; no string in either language matches `/bota|cure|behandl|treat/i` except inside the sentence referring to "vården"/"healthcare".
- [ ] **Step 2: Run** `bun test apps/www/src/content` — FAIL.
- [ ] **Step 3: Write the copy** with the copywriting skill's rules and the spec's anti-goals; the hub headline sv "Starkt ledarskap börjar från insidan" / en "Strong leadership starts on the inside".
- [ ] **Step 4: Run** `bun test apps/www` and `bun --filter @repo/www typecheck` — PASS.
- [ ] **Step 5: Commit** `feat(www): content for Ledarskap inifrån in Swedish and English`

### Task 6: www pages — hub, services, research, catalog and nav

**Files:**
- Create: `apps/www/src/app/inifran/page.tsx`, `apps/www/src/app/inifran/[service]/page.tsx` (`generateStaticParams` not used — pages are dynamic per locale; unknown slug → `notFound()`), `apps/www/src/app/inifran/forskning/page.tsx`
- Create: `apps/www/src/views/inner-hub-view.tsx`, `inner-service-view.tsx`, `inner-research-view.tsx`; `apps/www/src/components/inner/price-card.tsx`, `service-card.tsx`, `yoga-practice.tsx`
- Modify: `apps/www/src/views/book-view.tsx` (two headed groups; member keys never listed), `apps/www/src/views/offering-view.tsx` + `src/app/api/booking/group-events/route.ts` (pass `?offering=` for group kinds), `apps/www/src/views/home-view.tsx` (teaser section linking `/inifran`), `apps/www/src/lib/routes.ts` (`PUBLIC_ROUTES` + the six paths), layout nav offerings (the carousel shows the three start keys and `inner_group`, not the member keys)

**Interfaces:**
- Consumes: Tasks 4–5.

- [ ] **Step 1: Failing tests**: `routes.test.ts` expects the six paths in `PUBLIC_ROUTES`; a view test renders `InnerServiceView` for `coachning` in both locales and finds the price "2 700 kr", a link to `/book/inner_start_coaching` and one to `/book/inner_session`; `BookView` test asserts `inner_session` is not linked; the group-events route test forwards `offering=inner_group`.
- [ ] **Step 2: Run** `bun test apps/www` — FAIL.
- [ ] **Step 3: Implement** with the site's existing look (hero with `Picture`, `Eyebrow`, `Reveal`, sun glow, `rounded-4xl` cards); service pages: lead, "för dig som", outcomes, how it works, "yogan i praktiken", price card (start + per month + three months, "inkl. moms" / "exkl. moms"), FAQ, CTA "Boka startsamtal" + secondary "Redan med? Boka nästa samtal". Research page lists findings with numbered references and the limits.
- [ ] **Step 4: Run** `bun --filter @repo/www typecheck`, `bun test apps/www`, `cd apps/www && COOKIE_DOMAIN=.brand.localhost bun run build`, `bun scripts/bundle-budget.ts www` — PASS except "no budget" for new routes (Task 7).
- [ ] **Step 5: Commit** `feat(www): Ledarskap inifrån pages, catalog groups and nav`

### Task 7: Quality gates, journeys and docs

**Files:**
- Modify: `apps/e2e/a11y/routes.ts` (the six pages, plus an `en-light` variant of `/inifran`), `perf/budgets.json` (via `bun scripts/bundle-budget.ts --write-results www && bun run perf:update`, reviewed diff limited to new routes)
- Create: `apps/e2e/tests/inner.spec.ts`
- Modify: `docs/architecture/booking.md` (new keys, per-offering group events, member keys hidden), `apps/www/README.md`, `CLAUDE.md` (the `apps/www` line mentions `/inifran`; stay under the size cap)

- [ ] **Step 1: Write the journey** `"from the hub to a booked start call"`: `/inifran` → "Transformativ coachning" → price "2 250 kr" visible → "Boka startsamtal" → `/book/inner_start_coaching` → pick a slot, fill name/email → `/book/done` shows `BK-`; and `"Inifrån group lists only its own events"` (create one event of each offering over REST as admin, visit `/book/inner_group`).
- [ ] **Step 2: Run** with ports 3000–3009 free: `cd apps/e2e && bunx playwright test tests/inner.spec.ts tests/a11y-pages.spec.ts tests/a11y-reflow.spec.ts --grep "inifran|inner|/book" --reporter=line` — PASS.
- [ ] **Step 3: Run the repo gates** (Global Constraints) — PASS.
- [ ] **Step 4: Commit** `test(www): journeys, a11y and budgets for Ledarskap inifrån; docs`
