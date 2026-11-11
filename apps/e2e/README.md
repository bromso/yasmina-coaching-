# @repo/e2e

Browser end-to-end tests (Playwright) against **production builds** of `www`, `app`, `auth`,
`account`, `blog`, `docs`, `help` and `jobs`, plus `apps/api` and `apps/ai`, all started by
`playwright.config.ts` on their real `*.brand.localhost` hosts and ports. 422 tests across 41 spec
files, Chromium only, run serially (`workers: 1`) because every test shares one database and the
api's in-memory rate limiters.

## What it covers

Each spec file is one cross-app journey — the kind of thing unit and api tests cannot see because
they stop at one app's boundary:

- `auth.spec.ts` — sign up on `auth/signup`, land signed in; `account` shows the email unverified;
  the mailed verify link verifies it; `app` sends a user without a workspace to `/workspaces/new`;
  creating a workspace lands on `/notes`; sign-out from `app`'s user menu lands on
  `auth/login?signedout=1`, and `account` then redirects to sign-in; signing in again honours `next`.
- `magic-link.spec.ts` — "Email me a sign-in link" on `/login`; loading the mailed `/magic` link does
  not sign in; **Continue** does.
- `two-factor.spec.ts` — turn on two-step verification on `account/security`, reading the key off
  the page and computing the code in the test (`fixtures/totp.ts`, `@oslojs/otp`: what an
  authenticator app would show); keep a recovery code; sign out. The password alone now lands on
  `auth/login/verify`; a wrong code is refused there; the code for the *next* 30-second step signs
  in (the enable code's step is a replay the api refuses, and the next step is inside its ±1
  window — computed from a timestamp, never slept for). A recovery code signs in once and is
  refused the second time.
- `passkeys.spec.ts` — add a passkey on `account/security` through Playwright's Chromium virtual
  authenticator (CDP `WebAuthn.addVirtualAuthenticator`, resident keys and user verification both
  on); turn on two-step verification on the same account; sign out and sign in on `auth/login`
  with **Sign in with a passkey** — it lands signed in with no code step at all, even though
  two-step is on. A separate test proves the quiet, conditional-mediation (autofill) ceremony
  `PasskeySignIn` starts on mount can sign a visitor in on its own, with nothing clicked. A third
  test renames a passkey (a reload proves the new name is the server's), then removes it through
  the two-click **Remove** → **Confirm removal** arm-and-confirm.
- `email-change.spec.ts` — on `account/personal-info`, request a change to a fresh address; confirm
  it from the mailed `/email/confirm` link while still signed in as the old account, then sign out
  and sign in with the new address; read the old address's `emailChanged` mail and open its
  `/email/revert` link — the address is restored, every session (including the new one just signed
  in) ends, and the mailed `resetPassword` link sets a new password that signs back in with the old
  address. A second test requests a change, then cancels it from the `emailChangeRequested` mail's
  `/email/cancel` link instead — every session ends, and the captured confirm link is dead
  afterwards.
- `notes.spec.ts` — create a note, see it listed, delete it.
- `invitations.spec.ts` — the owner invites a second address from `account/workspace`; that user
  signs up, verifies, opens the mailed `/invitations/<token>` link, accepts, and lands on `/notes`
  with the joined workspace's heading; a third verified user opening the same link sees the
  address-mismatch refusal; the viewer never sees the add-note form (`notes-view.tsx` gates it below
  the `member` role) — the api's refusal of a viewer's write is covered by `apps/api`'s own tests.
- `workspace-activity.spec.ts` — the owner renames the workspace and invites a member from
  `account/workspace`; both changes show as sentences in the Activity card (admin and up, every
  plan), scoped to the card itself so no other page text can match; the invited member accepts and,
  once signed in as a plain member, never sees the card at all.
- `workspace-require-2fa.spec.ts` — an owner who already has two-step verification on creates a
  workspace, invites a member (who accepts while the requirement is still off), then turns on
  "Require two-step verification for all members" from the Workspace page's Security card, past its
  no-JavaScript confirmation naming the one member it would block; that member reloads `app/notes`
  and sees `TwoFactorRequiredNotice` in its place (title, body naming the workspace, a link to
  account `/security`, **Leave**), passes an accessibility check on that state, sets up two-step
  verification from the notice's own link, reloads `/notes` again (nothing redirects on its own) and
  sees the page; the owner's Activity card then shows "Required two-step verification for all
  members."
- `invite-domains.spec.ts` — the owner saves `example.com` in the Workspace page's Security card's
  Invitation domains section; the Invitations card's hint and invite form pick it up without a
  reload; inviting an address on another domain is refused with the api's own message, inviting an
  `@example.com` address succeeds, and the owner's Activity card shows "Changed the allowed
  invitation domains: added example.com."
- `notifications.spec.ts` — the owner invites a member who accepts, then changes their role to
  Admin from the Workspace page's members list; the member's bell shows "1 unread notification"
  (and its badge) server-rendered on both `account/notifications` and, after a reload, `app/notes`;
  the notifications list names the change ("Your role in … changed to Admin."), and **Mark all as
  read** clears both the bell and the row; a second role change, with the member already watching
  `app/notes`, arrives live over `/api/events/me` and updates the bell with no manual reload.
- `notification-email.spec.ts` — on `account/notifications`'s Email card, a member unchecks the
  role-change email and saves; the owner then changes their role, which lands in the inbox but
  mails nothing (a bounded `expect.poll`, not a sleep, confirms no mail arrives). The owner's own
  mock-billing plan change mails nobody either — the mirror never mails the actor, and under mock
  billing the sole owner is the actor (under `BILLING_PROVIDER=stripe` the checkout's webhook has
  no actor and mails every owner, the payer included; this stack runs the mock) — so the one real,
  deliverable optional mail the rest of the test exercises is `member.removed`: the owner removes
  the member, and the mail's RFC 8058 `List-Unsubscribe` header is POSTed one-click, turning that
  type off (checked on the settings page). The same mail's body link is then opened and confirmed
  a second time, idempotently, with both its confirm and success states checked for accessibility.
- `realtime.spec.ts` — the owner invites a `member`, who accepts; both open `app/notes` and both
  show "2 people here". A note the owner adds through the form appears in the member's list without
  a reload, and "Here now" stays on both pages (presence survives the list's re-seed after the
  action); the member reloads with the note on the page, in a browser context whose `timezoneId` is
  `America/Los_Angeles` (the list prints dates in UTC, so the server render hydrates unchanged); the
  owner deletes the note and it disappears for the member; the member closes its page and the owner
  then shows "1 person here" — the browser's disconnect reaches `apps/api` through `app`'s
  `/api/events` relay. Any console or page error naming a hydration mismatch (or one of React's
  minified hydration errors: #418, #419, #421, #422, #423 and #425 — the codes the regex matches)
  fails the test, on either page.
- `i18n.spec.ts` — on `auth/login`, picking Svenska in the header switcher reloads the page in
  Swedish (heading, labels), and a wrong password's error is Swedish too; signing up with that
  cookie still set produces a Swedish verification mail, found by recipient rather than by
  guessing its subject (`fixtures/mail.ts`'s `latestMailTo`); signing in to that account from a
  fresh browser context whose cookie says `en` still reads Swedish — the saved preference outranks
  it. The same signed-up account then creates a workspace and a note on `app/notes`, both in
  Swedish (no locale cookie of its own — the saved preference carries over); on `account`, the
  sidebar and Personal info are Swedish, changing the name shows the Swedish success message, and
  the Language card switches the whole page to English and back to Swedish again. A separate,
  cookie-less browser context then opens `www` (Swedish by default), picks English behind
  "Utforska" — the page reloads with `lang="en"`, the English hero and the nav's "Explore" — picks
  Svenska again, and a fresh visit of the header's "Logga in" link already lands on `auth/login` in
  Swedish, over the shared cookie domain.
  With JavaScript disabled, the switcher's plain form submit still changes the language. At phone
  width with a Swedish cookie, `auth/login`'s footer (its nav, a group title, a cross-app link)
  and the header's mobile menu (the hamburger, the sheet's title, its nav and links, its close
  button) are Swedish.
- `billing.spec.ts` — on Free, `/chat` shows the upsell; the owner switches to Pro with the mock form
  on `account/payments`; `/chat` loads and a message gets the `mock:echo` reply.
- `webhooks.spec.ts` — starts a plain `node:http` receiver on `127.0.0.1`; a Pro owner adds an
  endpoint on `account/workspace` pointed at it over `*.localhost`, subscribed to **Note created**
  only, and reads the `whsec_…` secret off the show-once panel. Creating a note on `app/notes`
  delivers a signed `note.created`: the test verifies `webhook-signature` by hand
  (`node:crypto`, the same HMAC Standard Webhooks scheme `apps/api/src/webhooks/sign.ts` signs
  with), the `webhook-id` shape, a `webhook-timestamp` within 5 minutes and the `user-agent`, and
  checks the body's `type` and `data.title`. It then disables the endpoint and adds a second,
  enabled one on the same receiver: a second note reaches the new endpoint (the positive signal
  that its deliveries ran) while the disabled one still has its single request.
- `admin.spec.ts` — a superadmin signs up, verifies, finds a user in `/admin/users`, impersonates
  with a reason (`app` shows the banner); `account/security`'s change-password is refused with "Not
  available while impersonating"; **Stop impersonating** returns to the admin's user page, where the
  audit log shows both the start and the stop; a normal user opening `/admin` sees the 404 page.
- `suspend.spec.ts` — a superadmin suspends a user with no end date (the reason field is labelled
  "Reason for suspending"); the success message stays on screen and the Suspension card reads
  Active; `/admin/users` with the **Suspended only** filter lists the user with a "Suspended" badge;
  the `accountSuspended` mail never contains the internal reason; the user's correct-password
  sign-in shows the suspended message with no field error and stays on `/login`; the superadmin
  lifts the suspension (the card reads Not suspended, the `accountUnsuspended` mail omits the
  reason) and the user signs in. Expiry is not driven here: an expired record (lifted, not
  re-suspended over) is covered by the auth view tests and the api suite.
- `audit-export.spec.ts` — a superadmin suspends a fresh user (a recognisable `user.suspended` row,
  the reason carrying the target's unique email), opens `/admin/audit`, sees the retention line,
  then exports CSV with the default From/To (the last 30 UTC days): the download's filename
  matches `audit-<from>-<to>.csv`, its header is the RFC 4180 BOM-and-quoted row, and the file
  contains the suspend row. The suspend row's `actor_id` is the admin's id; `/admin/audit?actorId=<it>`
  then shows the export's own `audit.exported` entry as that admin's newest row (so a row left by
  an earlier attempt cannot satisfy it).
- `analytics.spec.ts` — visiting `www`'s home page sends a pageview, no consent needed; signing up
  and verifying record `signed_up` and `email_verified`; as the e2e superadmin, `auth/admin/analytics`
  shows today with at least one visitor and pageview and the funnel's **Signed up** step at least 1 —
  polling by reloading, since the events are jobs the in-process worker drains on its own.
- `uploads.spec.ts` — upload a profile photo on `account/personal-info` ("Profile photo updated."):
  the header's user-menu trigger shows an `img` from `/files/avatars/…` whose bytes actually loaded
  (`naturalWidth` 1), and so does `app`'s on `/notes`; **Remove** brings the initials back. The
  workspace owner uploads a logo on `account/workspace` and the user menu's workspace item shows it
  from `/files/logos/…`. Upload then **Remove** without leaving the page leaves no image in the
  card, only the initials (the local preview does not outlive the action). After a valid upload, a
  file named `.png` holding `<svg/>` is refused with the api's `IMAGE_UPLOAD_MESSAGE` and the saved
  photo stays, in the card and the header. The api runs with `STORAGE_PROVIDER=local` and `STORAGE_DIR` under
  `.tmp/storage`, so uploads are reset with everything else.
- `www.spec.ts` — the home page shows the header, footer and the four coaching formats; its contact
  section leads to `/kontakt`; `/terms` and `/privacy` render.
- `contact.spec.ts` — a visitor goes through `/kontakt`'s three steps (each refusing to move on
  without its answer, the consent box required), lands on `/kontakt/tack` with the reference and the
  next step its answers lead to (the inifrån start call), gets the Swedish confirmation mail with
  that link and none of their own text; the e2e superadmin finds the lead on `/admin/leads`, opens
  it, and saves a status and a note. With JavaScript disabled an organisation's request shows every
  step at once and gets the proposal step (the keynote request form). Each run sends its own `x-real-ip`
  (a `198.51.100.x` address), so `leads.create`'s 5-per-hour per-ip limit never trips on reruns
  against reused servers.
- `blog.spec.ts` — the Swedish index (`<html lang="sv">`) opens on its hero; the header links home
  to www, to `/inifran` and `/book` there, and to the English index (`/en`, `<html lang="en">`) and
  back; `/rss.xml` and `/en/rss.xml` each answer in their own `<language>`; an unknown address is a
  Swedish 404 with the blog's chrome; the newest post opens with its title and the call to action
  linking to www's contact page, and its language link opens the English twin; with JavaScript disabled, the index
  still shows its hero and the header's site nav.
- `docs.spec.ts` — the landing page shows the intro and the sidebar; a sidebar link opens its page
  with breadcrumbs, and a table-of-contents link jumps to its heading (a URL hash); scrolled to a
  heading, the table of contents marks that section's link `aria-current="location"`, and the mark
  follows jumps (a TOC link to the last heading, then one scroll back above it); "Next" moves
  to the following page; the ⌘K/Ctrl K dialog (read off the button's own hint, since the "Desktop
  Chrome" device profile pins a non-Mac user agent regardless of the host) finds the
  Authentication page's "Workspaces" heading — picked out by its href, not its rank or case —
  opening it with the arrow keys and Enter, and by a click; a nonsense query shows "No results";
  with JavaScript disabled, `/getting-started` still shows its body and sidebar, and the search
  control is a link to `/all`, which lists every page.
- `developer-docs.spec.ts` — `/developers/reference/create-note` shows the h1 "Create a note" and,
  inside the `<Endpoint>` widget, `/v1/notes` and "Required scope: notes:write", plus an "Example
  request" heading and an `Authorization` header in the curl block; the ⌘K/Ctrl K search for
  "webhook signature" opens `/developers/webhooks/verifying-signatures`; the "API reference"
  sidebar folder lists the six reference pages in the generated order (Get the workspace, List
  members, List notes, Get a note, Create a note, Delete a note); a Pro workspace's
  `account/workspace` page ends its **API keys** and **Webhooks** cards with a docs link, each
  pointing at `/developers/authentication` and `/developers/webhooks` respectively.
- `help.spec.ts` — the home page's "Getting started" category card opens its category page, and
  its "Create an account" article card opens the article; the ⌘K/Ctrl K dialog finds a different
  article by body text ("authenticator app") rather than its title; that article's "Contact us"
  link carries its own path as `?from=`, and the contact form's success message shows a
  `HELP-<id>` reference; the e2e superadmin (the same fixture `admin.spec` and `analytics.spec`
  use) then finds that request on `auth/admin/support` by its reference, and **Mark resolved**
  moves it to the Resolved tab with "Resolved by admin@e2e.test".
- `jobs.spec.ts` — the home page's "Senior Full-stack Engineer" card opens the posting; **Apply for
  this role** opens its apply form; filling name, email, a tiny PDF CV and the consent checkbox
  and submitting shows a confirmation naming the applicant, the role and the address; the e2e
  superadmin then finds the application on `auth/admin/applications` (the list defaults to status
  "all", so no query string is needed), downloads the CV (a real PDF, checked by its `%PDF-`
  header) and sets its status to "reviewing".
- `chrome.spec.ts` — `www`, `app`, `auth`, `account`, `docs` and `blog` each answer `/api/health`
  and carry a `content-security-policy` header with `default-src 'self'` and without
  `'unsafe-eval'`; the home pages of `www`, `app`, `auth`, `docs` and `blog` have the site nav and
  the skip link (`account` redirects an anonymous visit to `auth`).
- `pwa.spec.ts` — each app's service worker registers on its own origin; on `app`, after a full and a
  `next/link` navigation, nothing in Cache Storage contains the user's name or email, signed in or
  after sign-out; offline, an uncached page shows
  the offline page, a visited public page still opens, and "Try again" loads it back online.
- `a11y-pages.spec.ts` — a page sweep over the manifest in `a11y/routes.ts`: one test per page ×
  variant (light/dark, plus Swedish on `auth`, `app` and `account` outside `/admin`, and English
  on `www`'s `/`, whose default is Swedish), each run
  through axe (`@axe-core/playwright`, WCAG 2.0–2.2 A/AA, whatever the rule's impact) via
  `expectAccessible` (`fixtures/a11y.ts`), failing on anything the reviewed allowlist
  (`a11y.allowlist.json`) does not cover, plus one test that fails on an allowlist entry no longer
  covering a violation on its pages; a handful of journey states that only render mid-flow
  (the two-step QR step, the open user menu, the cookie banner, …) are checked the same way from
  inside the journey spec that reaches them. `scripts/a11y.test.ts` (`bun test scripts`) fails when
  a `page.tsx` in one of the eight Next apps is in neither the manifest nor its `EXCLUDED` list.
- `a11y-keyboard.spec.ts` — four journeys driven by the keyboard alone (Tab, Shift+Tab, Enter,
  Space, Escape, arrow keys): signing in, applying for a role, sending the contact form, renaming a
  workspace and operating the account menu; each asserts every control is reachable in order, a
  visible focus indicator at every stop, and that a dialog or sheet traps focus, closes on Escape
  and returns focus to its trigger.
- `a11y-reflow.spec.ts` — every manifest entry (light only; admin detail and not-found pages
  included) at 320 × 640: the document never
  scrolls sideways (WCAG 1.4.10); a table, code block or chart scrolling inside its own container
  is fine.
- `a11y-motion.spec.ts` — with `reducedMotion: "reduce"`, `www /`, a blog post and a docs page hold
  no running animation after load.

  See `docs/guides/accessibility.md` for what each check covers, the manifest and allowlist, and
  what automation cannot catch.
- `request-id.spec.ts` — what a browser can see of the id a request carries end to end
  (`docs/guides/operations.md`): `www /`, `auth /login` and `app /notes` (signed in) each answer
  with an `x-request-id` header matching the 22-character base64url shape, and two loads of the
  same page get different ids.
- `perf-lighthouse.spec.ts` — a Lighthouse performance run (mobile emulation, simulated
  throttling, Playwright's own Chromium, no second download) against six public pages (`www /`,
  `docs /getting-started`, `blog /att-leda-genom-en-kris`, `help /getting-started/create-an-account`,
  `jobs /senior-fullstack-engineer`, `auth /login`), 3 runs each, the median of score/LCP/TBT/CLS
  judged against `perf/budgets.json`'s `lighthouse` section, the failure listing every run.
- `perf-vitals.spec.ts` — in-browser Web Vitals (`web-vitals`, injected before any page script):
  the same six pages plus two signed-in ones (`app /notes`, `account /security`), 3 fresh-context
  loads each, the median LCP/CLS judged against `vitals`. INP is out — it needs a real interaction.

  Both specs write every measurement to `perf/.results/` when `PERF_WRITE_RESULTS=1` (set in the
  `e2e` CI job, and by `bun run perf:measure`), for `bun run perf:update` to fold into the
  committed budgets. See `docs/guides/performance.md`.

## Run

```bash
bun --filter @repo/e2e e2e              # build the eight Next apps, then run every journey
cd apps/e2e && bunx playwright test tests/www.spec.ts   # one journey, on existing builds
cd apps/e2e && bunx playwright test --ui                # the Playwright UI runner
cd apps/e2e && bunx playwright test tests/a11y-pages.spec.ts -g "axe: help "   # one app's a11y sweep
```

- The `e2e` script (and the `e2e` CI job) builds with `COOKIE_DOMAIN=.brand.localhost` — the
  static apps (`www`, `docs`, `blog`, `help`, `jobs`) read it at build time, the same value `shared`
  gives the signed-in apps at runtime, so the `locale` cookie `StaticLocaleSwitcher` writes on
  `www` is readable on every other `*.brand.localhost` subdomain (`i18n.spec.ts`'s last step
  depends on this). Building one of them another way without that env var writes a host-only
  cookie instead.
- It also builds with `NEXT_PUBLIC_BOOKING_PAYMENTS=mock`: `inner.spec.ts` pays a start call with
  www's Swish mock, which a production build leaves off unless the flag says `mock` (invoice only).
- First time on a machine: `bunx playwright install chromium`.
- Ports 3000–3009 must be free, or (outside CI) a server already listening there —
  including a `bun dev` server — is reused as is. Set `CI=1` to always start fresh servers.
- **Against already-running servers:** start them yourself with the exact env in `e2e.env.ts`
  (`NODE_ENV=production`, the fixed service tokens, `COOKIE_DOMAIN=.brand.localhost`,
  `MAIL_PROVIDER=file` + `MAIL_DIR` for the api, …) and Playwright's `webServer.reuseExistingServer`
  (true outside `CI`) leaves them alone instead of starting its own. A reused server was not reset —
  see **Fresh state** below — so this only works for journeys that do not depend on a clean mailbox
  or database, and a server reused from a plain `bun dev` run (its own `log` mailer, not `file`) does
  not work for any journey that reads a mailed link.
- `CI=1 bunx playwright test` matches what CI runs: fresh servers, one retry, `forbidOnly` (a
  stray `.only` fails the run instead of silently narrowing it).

## `*.brand.localhost` resolution

Chromium, like every browser, resolves `*.localhost` to loopback without any `/etc/hosts` entry — on
macOS and on Linux distributions running `systemd-resolved` (which answers `*.localhost` by RFC 6761
without a real DNS query). A Linux machine without `systemd-resolved` (and CI's `ubuntu-latest`
runners, which is why the `e2e` GitHub Actions job checks and appends these itself) needs the hosts
listed explicitly:

```
127.0.0.1 www.brand.localhost app.brand.localhost auth.brand.localhost account.brand.localhost
127.0.0.1 docs.brand.localhost help.brand.localhost jobs.brand.localhost blog.brand.localhost
127.0.0.1 api.brand.localhost ai.brand.localhost
```

`getent hosts app.brand.localhost` tells you whether you need to.

## Fresh state

Every run that starts its own api resets `apps/e2e/.tmp` first: an empty SQLite database and an
empty mailbox directory. This is not Playwright's `globalSetup` — Playwright 1.63 starts `webServer`s
*before* `globalSetup` runs, which would delete the database out from under an api that had already
opened it. Instead `global-setup.ts`'s body runs as the first half of the api's `webServer` command
(`bun global-setup.ts && bun src/index.ts` in `playwright.config.ts`), so the reset always completes
before that api process opens anything, and only runs at all when the harness starts its own api — a
reused api (see **Run** above) keeps whatever state it already had.

Uploaded files land under `apps/e2e/.tmp/storage` (`STORAGE_PROVIDER=local`), reset the same way.

The api writes every mail it sends as a JSON file under `apps/e2e/.tmp/mail`
(`MAIL_PROVIDER=file`, `apps/api/src/mail/file.ts`) instead of sending it anywhere; `fixtures/mail.ts`
polls that directory for the newest message to an address matching a subject, and pulls the first
matching link out of its text body. The api stores only token hashes, so this mailbox is the only
place a test can find a verify, magic-link, reset or invitation link.

## Reports and traces

`use: { trace: "retain-on-failure", screenshot: "only-on-failure" }` — a trace and a screenshot are
kept only for a test that fails, under `apps/e2e/test-results/`. In CI the reporter is
`[["github"], ["html", { open: "never" }]]`; the html report lands in `apps/e2e/playwright-report/`
and both directories are uploaded as the `playwright-report` artifact unless the job was cancelled
(`if: ${{ !cancelled() }}`) — so a test that failed, then passed on CI's own retry, still has its
trace in the artifact. Locally the
reporter is `list`; open a trace with `bunx playwright show-trace <path>` or the kept html report
with `bunx playwright show-report`.

## Adding a journey

- One spec file per journey, named for what it covers. Reuse `fixtures/accounts.ts`
  (`signUp`, `verify`, `signUpVerified`, `signIn`, `signOut`, `createWorkspace`),
  `fixtures/mail.ts` (`latestMail`, `latestMailTo` — by recipient alone, for a subject in a
  language the test does not want to hard-code — and `linkIn`), `fixtures/totp.ts` (`totpCode`,
  `nextStepCode`) and
  `fixtures/images.ts` (`PNG_1X1`, a valid 1×1 PNG for `setInputFiles`) rather than re-deriving
  sign-in, mail-reading or upload steps. Sign-up leaves the browser signed in: call `signIn` only
  after a `signOut` (with a live session `/login` has no form to fill).
- Always use `uniqueEmail(prefix)` for any address a test creates — the suite runs serially against
  one shared database and the api's per-email rate limiters, so a reused address across tests or runs
  can trip a limiter or collide with a previous run's state.
- Select by role, label and visible text only (`getByRole`, `getByLabel`, `getByText`) — the same
  elements a person or a screen reader sees. No test ids are added to app code for this suite.
- No fixed sleeps. Playwright's web-first assertions (`expect(locator).toBeVisible()`, `toHaveURL()`,
  …) already retry; the explicit polls in the suite are `latestMail`, because a mail send is a queued
  job that runs after the response and there is nothing in the DOM to assert on while waiting for it, and
  `uploads.spec.ts`'s `expect.poll` on an image's `naturalWidth` (a DOM property, not an attribute
  a locator assertion can wait on).
- **Never paper over a flake.** This suite has already found two real, previously-unknown bugs in
  the applications themselves (see "Deviations" in
  `docs/superpowers/specs/2026-10-04-e2e-design.md` and CLAUDE.md's **Status pages** entry). A test
  that fails intermittently is reporting something true about the app's behaviour until proven
  otherwise — retrying it away, loosening its assertion, or adding a sleep to make it pass hides the
  next real bug instead of fixing this one. Treat `retries: 1` in CI as a tool for triaging flakiness
  (a test that needs its retry shows up in the report), not a way to make a real failure disappear.

## Visual baseline (opt-in)

`tests/visual.spec.ts` screenshots www and blog pages (`visual/pages.ts`) in light and dark at 320
and 1280 px (`maxDiffPixelRatio: 0.001`; the hero video, `<time>`, the booking calendar and the
footer year are masked). Baselines are **not committed**: they are platform-specific and about 50 MB,
so they live in the git-ignored `visual/.snapshots/` and you generate them locally, on unchanged
code, before you change any styling. The default run and CI never include the spec (`chromium`
ignores it). Build `www` and `blog` for production first (`COOKIE_DOMAIN=.brand.localhost
NEXT_PUBLIC_BOOKING_PAYMENTS=mock`), then:

    VISUAL=1 bunx playwright test --update-snapshots   # 1. write the baseline
    VISUAL=1 bunx playwright test                      # 2. compare after your change

It starts only api, www and blog. A missing baseline fails the compare run by design.
