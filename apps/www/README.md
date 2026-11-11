# @repo/www

Marketing site — Next.js 16 on www.brand.localhost:3000 in development, `www.brand.com` in production.

Yasmina Petersson's leadership-coaching site: one landing page, `/terms` and `/privacy` templates,
the `/kontakt` contact page backed by `apps/api`'s lead pipeline, the cookie consent banner, OG images,
`sitemap.ts`, `robots.ts` and a `not-found` page, in Swedish and English. Every page renders per
request (ƒ): it reads the visitor's language from the `locale` cookie.

## Language

www is **bilingual**: Swedish by default, English when the visitor picks it.

- **How the language is chosen.** `getLocale()` (`src/lib/locale.ts`, server-only, wrapped in
  React `cache`) returns `en` only when the shared `locale` cookie (`LOCALE_COOKIE` from
  `@repo/i18n/cookie`) is `en`, otherwise `sv`. `Accept-Language` is ignored: the site is Swedish
  first. The pure half (`localeFromCookie`, `SITE_LOCALE`, the `Intl` and Open Graph tags) is in
  `src/lib/site-locale.ts`. Reading the cookie makes every page dynamic (ƒ); that is the price of
  switching the page itself.
- **Switching.** The header's `StaticLocaleSwitcher` (in the navigation's panel) gets
  `current={locale}` and `reloadOnChange`: pressing **Byt** / **Change** writes the cookie on the
  shared cookie domain and reloads, so the page comes back in the other language at once (no
  saved note). Switching needs JavaScript; reading the page in either language does not.
- **Where each language's copy lives.** Every content file exports both languages with one type
  and a picker: `src/content/home.tsx` (`HOME`, `homeFor` — the landing page, the nav links, the
  page metadata), `src/content/booking.tsx` (`BOOKING`, `bookingFor` — the booking pages),
  `src/content/booking-forms.ts` (`BOOKING_FORMS` — what the client booking forms say,
  client-safe, read through `useBookingCopy()` under the `LocaleProvider` in
  `src/components/booking/locale-provider.tsx`), `src/content/media.ts` (`mediaFor`, `clipsFor`,
  `mediaTextFor` — alt texts and media labels), `src/content/contact.ts` (`CONTACT`, `contactFor` —
  the contact page, its form and its done page, client-safe like `booking-forms.ts`),
  `src/content/site.ts` (`SITE` — the navigation's
  own labels, the footer's legal line, the switcher) and `src/content/status.ts` (`STATUS` — the
  404 and error pages). The cores' own messages are per-locale maps in `src/lib/leads.ts`
  (`GENERIC_FAILURE`, `TOO_MANY_REQUESTS`; every field's message is `CONTACT[locale].form.check`)
  and `src/lib/booking.ts`
  (`GENERIC_FAILURE`, `DATE_TOO_SOON`, `CONFIRM_REQUIRED`). `src/content/home.test.ts` checks that
  every Swedish key exists in English as a non-empty string (and back), and that neither language
  carries an exclamation mark.
- **Flow.** Cookie → `getLocale()` in the layout and each page → props down to the server
  sections (and `LocaleProvider` around the client booking forms) → `getLocale()` again in each
  server action, which passes it to the cores and sends it to `apps/api` as `x-locale`, so the
  api's declared error messages on the forms and every mail (the contact form's confirmation,
  booking confirmed, request received, cancelled) follow the page; the api stores it on the booking order, so later mails
  about it follow too.
- **Chrome.** The shared chrome (nav landmark, cookie banner, sign-in link, theme toggle, skip
  link, footer groups) reads `translatorFor(locale, "ui")`; `<html lang>`, the metadata (title,
  description, `og:locale` `sv_SE` / `en_GB`) and the status pages follow the locale.
  `error.tsx` (a client component) reads `<html lang>`; `global-error.tsx` stays Swedish.
- **Dates** on the booking pages format with `sv-SE` or `en-GB`, 24-hour, in `Europe/Stockholm`
  (`src/lib/booking-dates.ts`; every formatter takes the locale).
- **Left alone on purpose.** `/terms` and `/privacy` are English templates in both languages
  (placeholders for counsel, see **Content**), rendered inside the localized layout. The web
  manifest and the OG image stay Swedish (one file each, fetched without the visitor's cookie).
  Zod's own field messages on the forms (an invalid email, a too-short message) come from the
  contract in English, as before.

```bash
bun --filter @repo/www dev       # http://www.brand.localhost:3000
bun --filter @repo/www build     # standalone output for docker/next.Dockerfile
bun --filter @repo/www analyze   # bundle report in .next/analyze/
```

## Routes

| Route | Dev URL |
|---|---|
| `/` | http://www.brand.localhost:3000 |
| `/book` | http://www.brand.localhost:3000/book |
| `/book/[offering]` | http://www.brand.localhost:3000/book/session (one page per `OFFERING_KEYS` entry) |
| `/book/done` | the confirmation after a booking or request (`?ref=`, `?manage=`, `?kind=`, `?paid=`) |
| `/book/manage/[token]` | the manage page behind the link in the confirmation mail |
| `/kontakt` | the contact page and its three-step form (see **Contact page**); `?from=<www path>` names the page a link sat on |
| `/kontakt/tack` | the form's done page: the reference and the tailored next step (`?ref=`, `?for=`, `?need=`, `?when=`) |
| `/inifran` | the Ledarskap inifrån hub (see **Ledarskap inifrån**) |
| `/inifran/[service]` | one of `coachning`, `mentorskap`, `livsstil`, `grupp` |
| `/inifran/forskning` | the research behind the track |
| `/terms` | http://www.brand.localhost:3000/terms |
| `/privacy` | http://www.brand.localhost:3000/privacy |

Every app also serves `/offline` (the PWA fallback page) and `/api/health` (used by the Docker
health check).

## Content

All copy lives in data files; the views and pages only arrange sections.

- `src/content/home.tsx` — every word on the landing page, in page order: hero (photo, headline,
  two calls to action, three stats), the statement, the four offers, the manifesto paragraph, the
  about section (portrait plus three reasons), the three steps, the CV (`credentials`), the FAQ
  and the closing contact teaser, in both languages (`HOME.sv`, `HOME.en`, one `HomeContent` shape).
  `nav` is the header's in-page links and `SECTION_IDS` the anchors they scroll to (the same in
  both languages); `src/content/home.test.ts` keeps them in step, checks both languages share
  every key, and that the copy carries no exclamation mark. `meta` feeds the page metadata; the
  web manifest uses the Swedish one.
- `src/views/home-view.tsx` arranges the sections. The www-specific ones live in
  `src/components/*-section.tsx` (hero, statement, offers, manifesto, why, steps, credentials)
  next to the small `ArrowLink` and `Eyebrow` pieces; the FAQ reuses the shared `Faq` block from
  `@repo/ui`, and the closing `#contact` section is a short teaser linking `/kontakt`.
- Photos and the five clips live under `public/media/` (JPEG + WebP at full size and an `-800`
  width, MP4 without audio plus posters), described in `src/content/media.ts` (`MEDIA`, `CLIPS`,
  `OFFERING_MEDIA`, alt texts in both languages: `mediaFor(locale)`, `clipsFor(locale)`). `<Picture>` (`src/components/picture.tsx`) renders them
  with explicit sizes; `MediaClip` plays a clip once, only where motion is welcome, behind a
  pause/play button. The originals sit in `assets/originals/`, outside `public/`, and the service
  worker precaches only the offline page, icons and logo (`globPublicPatterns` in
  `next.config.ts`), never the media.
- `src/content/terms.ts`, `src/content/privacy.ts` — the legal templates, one `LegalSection` per
  heading, still English placeholders (their page titles too). Replace `[Company]`, `[Jurisdiction]`
  and `[Contact email]`, update `updatedAt`, and have counsel review them — in Swedish and
  English, since the rest of the site is both. Each page shows the notice in `src/content/legal-notice.ts` until you remove it.

## Booking

The booking journey (see **Booking.** in `CLAUDE.md` and `docs/architecture/booking.md`). Every word
is in `src/content/booking.tsx`; the catalog itself (`OFFERINGS`, kinds, limits) comes from
`@repo/api-contract/booking-limits`, Zod-free so the client components can read it.

- `/book` lists the offerings for `?for=private|organisation` (plain links). `/book/<key>` is one
  page with three journeys by kind: `instant` (a client calendar over `@repo/ui`'s `Calendar`
  fetching `/api/booking/availability` on this origin, slot buttons with `aria-pressed`, a details
  form, server action `book`), `group` (events from `/api/booking/group-events` grouped by series,
  checkboxes, action `reserveSeats`) and `request` (a plain form with up to three preferred dates,
  action `requestBooking`). The two route handlers validate their query with the contract, call the
  api with the service token (`anonymousApi`) and answer `Cache-Control: private, no-store`, so
  the browser never calls `apps/api` and the CSP's `connect-src 'self'` stands.
- The cores (`src/lib/booking.ts`, tested) show a declared api error's own message (a taken slot,
  a full event, the rate limit) and a generic failure otherwise; the actions `redirect()` to
  `/book/done`, which links the manage URL only when it is on this site's own origin.
- Every journey shows one stepper (`components/booking/step-indicator.tsx`; steps per journey in
  `src/lib/booking-flow.ts` and `steps` in `src/content/booking-forms.ts`): instant and group pick,
  give details, pay, done; a request describes, gives details, reviews, done; a members' session or
  an extra programme session picks, gives details, done. Steps stay mounted and hidden, and the
  new step's heading takes focus. The payment step is loaded lazily (`lazy-payment-step.tsx`).
- Payments sit behind one seam, `src/lib/mock-payment.ts` (a real provider must authorise, book,
  then capture or void, and feature-detect the wallets — see its header). The build-time flag
  `NEXT_PUBLIC_BOOKING_PAYMENTS` decides what is offered: `mock` turns on the mock Apple Pay,
  Google Pay and Swish for an offering with a fixed price (`amountFor` in
  `src/content/booking.tsx`); unset, they are on outside production and **off in a production
  build**; any other value turns them off. Off, or for an offering priced in writing, every booking
  pays by invoice only, with no "test mode" line anywhere — and the server action refuses any
  other method, whatever the browser sends. Like `COOKIE_DOMAIN`, the value is fixed at
  `next build`. Posted with the booking: `paymentMethod` and, for an organisation paying by
  invoice, its organisation number, invoice reference and invoice address, which the action
  checks and appends to the booking's `notes` as a labelled `[Betalning]` block (the visitor's own
  note is shortened to fit `BOOKING_NOTES_MAX`, the block never is), so Yasmina's mail carries
  them. The Swish number is never posted. `/book/done` shows the method from `?paid=`
  (`DONE_PAYMENTS`), mock lines only while the mock is on. The Inifrån group's monthly price is
  multiplied by the calendar months (Stockholm) its chosen dates fall in.
- `/book/manage/[token]` lists the order's bookings and package and, for a confirmed future
  session, a cancel form (action `cancelBooking`) with a required "Yes, cancel" checkbox; the api
  refuses inside the 24-hour cutoff. `robots.ts` disallows `/book/manage/` and `/book/done`.
- Times render in `Europe/Stockholm`, formatted with `sv-SE` or `en-GB`
  (`måndag 2 mars 2026, 09:00–10:00` / `Monday, 2 March 2026, 09:00–10:00`;
  `src/lib/booking-dates.ts`); the api stores UTC.
- Every booking action sends `x-locale` = the page's language, so the api's own refusals shown on
  the form (a taken slot, a full event, the cutoff, the rate limit) and the mails match the page.

## Ledarskap inifrån

The "Leading from within" track (Swedish slugs in both languages). Every word, both
languages, is in `src/content/inner.tsx`; prices come from `src/content/inner-pricing.ts` (an
hourly rate with discount tiers, private clients incl. VAT, organisations excl.), never typed into
the copy. Pages are dynamic per locale like the rest of www.

- `/inifran` is the hub: the four services, how it works, the FAQ. `/inifran/<slug>` is one
  service (`coachning`, `mentorskap`, `livsstil`, `grupp`) with its fixed prices, a "Boka
  startsamtal" link to `/book/inner_start_<kind>` and, for the three one-to-one services, the
  members' session key (`inner_session` / `inner_mentoring_session`) for returning clients.
  `/inifran/forskning` lists the references.
- The group's dates are `inner_group` events (`/book/inner_group`); the members' sessions are
  bookable by link but hidden from `/book` and the nav (see `docs/architecture/booking.md`).
- Three silent clips for the track live in `public/media/` with the others (see `src/content/media.ts`).
- Checks: `views.test.tsx`, `inner.test.ts`, `inner-pricing.test.ts`; the journey is
  `apps/e2e/tests/inner.spec.ts`; the pages are in the a11y manifest and `perf/budgets.json`.

## Look

`src/styles/globals.css` imports the shared design system and then the coaching theme,
`@repo/ui/themes/coaching.css`, which overrides the colour tokens for www and the blog alike: a
warm cream background, charcoal text and buttons, one blue (`--brand-blue`) and a yellow "sun"
(`--sun`, `--sun-soft`) for the editorial sections, each with a dark-theme value. Every text pair
clears WCAG 4.5:1 in both themes, pinned by `packages/ui`'s contrast test; keep it that way when
retuning, and remember the blog changes with it. Headlines are set in `fontDisplay` (Fraunces, from
`@repo/ui/lib/fonts`): the layout adds its CSS variable to `<body>`, the theme points
`--display-family` at it, and an unlayered `h1, h2` rule applies it at weight 400 even where a
shared block says `font-semibold`. www's own motion, breakpoints and high-contrast rules stay in
its stylesheet. The other apps keep the shared palette and Inter.

## Contact page

`/kontakt` is the top of the sales funnel (see **Leads.** in `CLAUDE.md` and
`docs/architecture/leads.md`). A hero (`portraitOffice`, who Yasmina is, what happens after you
write, "Du får svar inom två arbetsdagar.") beside the form, `src/components/contact/contact-form.tsx`,
in three steps on the booking journey's own stepper and step helpers: who the visitor writes for
(private person or organisation), what they need and how soon (plus an optional description of at
most 2000 characters), then their details — name, email, phone (required only for a call),
organisation and role (shown only for an organisation), the preferred contact method, a required
consent box and a separate newsletter box, neither pre-ticked. The fourth step is
`/kontakt/tack`: the reference, the tailored next step (`leadNextStep` from
`@repo/api-contract/leads`, the same rule as the confirmation mail — a start call, the intro call
or a session, a proposal with the matching request form, or two blog posts and `/inifran`) and
"Vad händer nu".

The action `sendLead` (`src/app/actions.ts`) reads the browser's ip (`requestInfo` from
`@repo/session`), builds an anonymous api client keyed on it (`src/lib/api.ts`, service token only,
`x-locale` = the page's language) and calls `leads.create`; the logic is `sendLeadCore` in
`src/lib/leads.ts` (tested with `bun test`): every refusal is that field's own message in the
page's language, a private person's organisation and role are never sent, the limiter's refusal is
the page's own `TOO_MANY_REQUESTS`, anything else is logged and shown as a generic failure, and a
success redirects to `/kontakt/tack?ref=…&for=…&need=…&when=…` (the reference and the three fixed
answers only; the done page re-checks them). The form works without JavaScript: every step then
shows at once and the one submit button posts it. Every contact link on the site, the booking
pages and the blog points at `/kontakt`; the home page's `#contact` section is a teaser for it.
Pages read without JavaScript, so the app ships no root `loading.tsx` (React would outline the
large pages behind an inline script).

The api limits contact requests per `x-api-client-id`; www sends one per browser ip. That is reliably the
browser's own behind a proxy that sets `x-real-ip` or overwrites `x-forwarded-for`. With no proxy,
`next start` fills `x-forwarded-for` from the socket, but a direct client can send its own header,
so the key is best-effort; behind a proxy that sets neither, every visitor shares the proxy's
bucket.

## Cookie consent

The layout renders `CookieConsent` from `@repo/ui` after the footer. It writes `consent=all|necessary`
on the cookie domain: `COOKIE_DOMAIN`, else `.brand.localhost` outside production. The value is fixed
at **build** time (`next.config.ts` inlines it as `BUILD_COOKIE_DOMAIN`, although the pages now
render per request), so set `COOKIE_DOMAIN` in the build environment — the Compose
build (`docker-compose.yml`) already does this, passing it to `docker/next.Dockerfile`'s builder
stage as a `COOKIE_DOMAIN` build arg (default `.brand.localhost`), so an image built that way shares
the choice across subdomains without extra setup. A production build run outside Compose without it
writes a host-only cookie: the choice then holds on www only, and the other subdomains ask again.
The banner reads the cookie after mount (a one-frame check on first visit).

## Locale

The header's `StaticLocaleSwitcher` (`@repo/ui/components/static-locale-switcher`) switches this
page's language (see **Language**) and, through the shared `locale` cookie, the signed-in apps'
too. Until hydrated it renders an invisible, `aria-hidden`, `inert` placeholder of the same size
(the header must not shift when it appears), then adopts the cookie's own value; picking a
language writes the cookie itself (`writeLocaleCookie`, the same `document.cookie = …` pattern
`CookieConsent` above already uses, built from `@repo/i18n/cookie`'s `localeCookie`) and, with
`reloadOnChange`, reloads the page. It takes the same build-time `cookieDomain` the consent banner
does: building without `COOKIE_DOMAIN` writes a host-only cookie, so the choice holds on `www` only
and the signed-in apps never see it (see `apps/e2e/README.md`'s **Run** section for where the e2e
build sets it).

Every server action sends that same locale to the api as `x-locale` (`getLocale()` in
`src/app/actions.ts`), never the api's English default for a Swedish page: the api stores it
against the new lead or booking order and sends its mails in that language. See
`docs/guides/i18n.md` and the root `CLAUDE.md`'s **i18n.** paragraph for the shared layer.

## Environment

| Var | Needed for | Dev default | Production |
|---|---|---|---|
| `API_URL` | the contact and booking actions | `http://api.brand.localhost:3007` | required — `next start` refuses without it (`src/instrumentation.ts`) |
| `API_SERVICE_TOKEN` | the contact and booking actions | the dev token | required, as above |
| `COOKIE_DOMAIN` | the consent cookie (build time) | `.brand.localhost` | optional — see above |
| `SITE_DOMAIN` | every cross-app link (build time) | `brand.localhost` with dev ports | your parent domain |

## Where things go

- **Views** — `src/views/<route>-view.tsx`: page-level compositions of `@repo/ui` blocks and
  components. Pages in `src/app/` stay thin and just render a view.
- **Content** — `src/content/`: the copy each view or page renders.
- **App-only components** — `src/components/`. Anything shared by two apps belongs in
  `packages/ui` instead.
- **Styles** — `src/styles/globals.css` starts with `@import "@repo/ui/globals.css";` and
  `@import "@repo/ui/themes/coaching.css";`; fonts, theme,
  skip link and web vitals come from `@repo/ui` too.

See the root [README](../../README.md) and [CLAUDE.md](../../CLAUDE.md) for the conventions shared by
all apps.
