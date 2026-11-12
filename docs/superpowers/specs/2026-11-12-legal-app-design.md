# The legal app: one home for every legal text

## Intent
Yasmina Petersson's site runs eight apps:
- **Public:** www, the blog, docs, help and jobs.
- **Signed in:** auth, app and account.

Each of them points visitors to privacy and terms text. Today that text lives in two content files in `apps/www` (`privacy.ts`, `terms.ts`). It is the boilerplate's generic SaaS template with `[Company]`-style placeholders, and it says nothing about bookings.

The user wants a dedicated app, `apps/legal`, built like `apps/blog`, as the only home for legal text. It should carry the pages this project actually needs, drafted from what the code really does. Wherever a fact only Yasmina or a lawyer can supply is missing, the draft gets a clearly marked placeholder, and a lawyer reviews it before launch.

Why: legal text that every app links to should exist once, be easy to edit as content, and show its history. Clients of a coaching business, and organisations buying from it, need to see when and how terms changed.

## Goals
1. **A new static content app, `apps/legal`, shaped like `apps/blog`:**
   - MDX pages compiled with fumadocs-mdx over `@repo/content`;
   - the shared coaching look (`@repo/ui`; no app styling, per the design-system rules);
   - Swedish at `/`, English under `/en`, with one root layout per language for `<html lang>`, as the blog does;
   - its own subdomain, `legal.<domain>`.
2. **Four pages, each in Swedish and English:**
   - **Privacy and cookies.** What the site collects and why, the legal basis, retention, recipients and processors, transfers, the visitor's rights, how to complain to IMY, and a cookie list.
   - **Terms and booking rules.** The coaching services and how booking works; prices and payment (link to the price pages, never restate prices); cancellation and rescheduling; the right of withdrawal for consumers; terms for organisations; accounts, workspaces, paid plans and API keys; liability; complaints (including ARN for consumers); governing law.
   - **Accessibility statement.** The level aimed at (WCAG 2.2 AA), how it is checked (the repo's axe, keyboard, reflow and motion e2e suites), known gaps, and how to report a problem.
   - **Company and contact details.** Who runs the site and how to reach them, including about personal data.
3. **Version history on every page.** Each page shows "Last updated" plus a change log: a list of dates, each with a one-line summary. Both come from the page's own frontmatter, and "Last updated" is always the newest log entry.
4. **The legal app is the only home.**
   - www's `/privacy` and `/terms` redirect permanently to the matching legal page, in the visitor's language.
   - Every place that links to legal text links to the legal app instead:
     - the cookie banner's `privacyHref` in every app;
     - every footer's `SiteFooterLegal`;
     - auth's terms note;
     - www's contact, booking and waitlist consent lines;
     - any email that links to privacy or terms.
   - Nothing is left that renders legal text outside `apps/legal`.
5. **The drafts describe what runs at launch.**
   - **Apps:** what `deploy/dokploy` ships: www, blog, auth, app, account and api, plus the new legal app.
   - **Left out:** docs, help, jobs and ai are not deployed, so their data (support requests, job applications, the AI chat) is not described. Adding one of them later means updating the policy.
   - Every claim about data must match the code: what each form stores, each prune job's retention, the cookies set, and which providers receive data.
   - Where the code has no answer (bookings have no retention job yet), the text has a placeholder, never an invented number.
6. **Booking asks for consent to the terms.**
   - Every booking and request form in www's `/book` gets a required checkbox: "Jag har läst villkoren och integritetspolicyn" / "I have read the terms and the privacy policy", with both linked. It works without JavaScript, and its error is linked to the field like the contact form's.
   - The booking-confirmation email links the terms and states the withdrawal right in one line, so a consumer receives that information in writing. The api records the acceptance with the booking: a timestamp plus the terms version, which is the newest change-log date.
7. **Drafts are marked and hidden until the lawyer approves.**
   - Every page shows a "Utkast – granskas juridiskt" / "Draft – under legal review" notice.
   - The whole app sends `noindex`, and robots disallows it.
   - One build-time switch, `LEGAL_DRAFT` (on unless set to `false`), turns both off.

## Non-goals
- No final legal advice. The text is a draft for a lawyer's review.
- No data processing agreements, no record of processing activities (Article 30 register), and no internal policies.
- No change to the cookie banner's behaviour or to what the site collects. If drafting shows a gap, such as bookings lacking a retention job, record it as a finding; don't fix it here.
- No CMS or admin editing. The pages are edited as MDX in the repo, like blog posts.
- No new copy outside the legal pages, apart from the booking consent checkbox and email line (goal 6) and links that must point at the new URLs.
- No archive of earlier versions. The change log's one-line summaries are the history, with full text history in git.

## Anti-goals (failures even if it technically works)
- **An invented fact:** an org. number, an address, a legal basis written as if decided, a retention period the code doesn't enforce, or a provider the site doesn't use.
- **Legal text in two places,** for example www keeping a copy, an email quoting the policy, or the two languages saying different things.
- **A placeholder that looks like final text.** Every placeholder must be impossible to miss, both in the page and in a test.
- **AI-sounding or stiff Swedish.** The Swedish is natural plain language, the kind a careful Swedish business would publish. It is not a translation of the English.
- **A broken link anywhere** after the move, in any app or email, in either language.

## Constraints
- **A new app follows the repo's own checklist** in CLAUDE.md ("Adding a new subdomain app", steps 0–11 for a static content app):
  - the `SITES` entry;
  - the dev script and port (3010 is free);
  - PWA (`public` kind);
  - proxy and status pages;
  - OG, sitemap and robots;
  - telemetry and analytics routes;
  - the layout with the shared header, footer and cookie banner;
  - Docker (compose, the GHCR matrix, the dev compose, devcontainer ports);
  - the content-app pieces (`source.config.ts` importing its schema by relative path, `postinstall`, `.source/` ignored);
  - a static locale switch like the blog's language link.
- **The guards that must pass:**
  - every `scripts/*.test.ts`: app styles, site footer, PWA, Docker, a11y manifest, CI plan, GitHub templates and CODEOWNERS, client imports, the CLAUDE.md size cap;
  - perf budgets for the new routes;
  - the a11y sweep in light and dark.
- **Staging:** the app gets a Dokploy service and domain, `yas-legal.undefined.guru`, in `deploy/dokploy`, the same way the other apps do.
- **CI minutes are limited.** Run the full CI suite locally before any push (`bun run ci`, Storybook, builds, bundle budgets, e2e, load, Docker, security), then push once.
- **Legal research.** The user asked for Legal Data Hunter, which covers Swedish and EU law, to check the statutes the drafts cite. It is not connected in this session yet. Until it is, cite only well-known instruments by name: GDPR, distansavtalslagen (2005:59), konsumenttjänstlagen (1985:716), lagen om elektronisk kommunikation (2022:482) for cookies, and ARN. Mark every legal claim that still needs checking with a placeholder.

## Decided
- **Move, not copy.** The legal app replaces www's `/privacy` and `/terms`. The old URLs redirect, and www's `privacy.ts`, `terms.ts`, `legal-notice.ts` and their pages are deleted.
- **Pages:** privacy and cookies; terms and booking rules; accessibility statement; company and contact details.
- **Drafting.** Claude drafts plain Swedish and English from the code, with placeholders for what only Yasmina or a lawyer knows. A lawyer reviews before launch.
- **History.** Each page has a "Last updated" date and a change log. Earlier versions are not kept readable.
- **Scope is what runs at launch** (goal 5), not everything the code can do.
- **Booking gets a required terms checkbox** (goal 6).
- **Drafts get a visible notice and stay out of search engines** until the lawyer approves (goal 7).
- **The signed-in apps are in scope.** Clients will use accounts, workspaces, paid plans and API keys, so the privacy and terms pages cover them too.

## Calls made by the controller (not the user; revisit if wrong)
1. **URLs.**
   - Swedish: `/integritet`, `/villkor`, `/tillganglighet`, `/foretaget`.
   - English: `/en/privacy`, `/en/terms`, `/en/accessibility`, `/en/company`.
   - `/` and `/en` list the four pages with their "Last updated" dates.
   - The cookie list is a section of the privacy page (`#cookies`), not its own page.
2. **Content shape.**
   - `apps/legal/content/pages/<slug>.mdx` with `locale: sv`, and `en-<slug>.mdx` with `locale: en` and `translationOf`, as the blog does.
   - The frontmatter holds `title`, `description`, `locale`, `translationOf?` and `changes: { date, summary }[]` (newest first, at least one entry).
   - A new schema lives in `@repo/content`, and the build gate fails on a page with no change log, or on a translation whose newest change date differs from its source's.
3. **Placeholders** are written `[ATT FYLLA: …]` in Swedish and `[TO FILL: …]` in English.
   - The page renders them highlighted.
   - A test lists every one, so the open items are one command away.
   - A production build does not fail on them, because staging must still deploy. The list goes in the PR.
4. **Retention figures come from the code.** In the drafts:
   - **From the code:** leads 12 months, audit log 365 days with ip and user agent removed at 90, raw analytics 90 days, telemetry errors 30 days and vitals 7, data exports 7 days, account deletion 7 days after the request.
   - **Bookings:** a placeholder plus a finding, because no prune job exists.
5. **Recipients and processors** are those the launch uses: mail (Resend or SMTP) and the hosting server.
   - Each provider whose use at launch is undecided gets a placeholder, never a claim: Stripe (staging runs mock payments), S3-style file storage (staging is local), and Google, GitHub or Apple sign-in.
   - Sentry, PostHog, Plausible and Anthropic are not used at launch and are left out.
6. **The accessibility statement is voluntary.** The Swedish DOS law covers the public sector, not a private coaching business, so the statement says that. It uses the structure the Swedish Agency for Digital Government (DIGG) recommends anyway.
7. **Navigation.** The legal app is not in the cross-app `siteNav`. It is reached through every footer's legal line (`SiteFooterLegal`: privacy, terms, accessibility) and the cookie banner, and its own header links back to www.
8. **Links follow the reader's language.** Static apps use the page's language and signed-in apps the user's locale. No app hard-codes a path.
9. **Redirects in www follow the `locale` cookie,** the same rule www's pages use: `sv` → `/integritet` and `/villkor`, `en` → `/en/privacy` and `/en/terms`.

## Left to the builder
- Whether pages render through the existing `@repo/ui/blocks/legal-page` block or a new MDX layout, as long as the look is shared and nothing is styled in the app.
- How the change log and placeholder highlight render. They must work without JavaScript and pass axe and contrast checks.
- The exact sections inside each page, guided by the goals above and what the code does.
- How URL helpers expose the legal pages to other apps, for example a `legalUrl(page, locale)` in `@repo/sites`, so no app hard-codes a path.
- The e2e journeys. At minimum:
  - each page in both languages;
  - www's old URLs redirecting;
  - the cookie banner's privacy link landing on the legal app;
  - every footer's legal links resolving.
