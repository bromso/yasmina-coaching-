# Leads

Full reference; `CLAUDE.md` keeps the summary and the index. A bold name such as **Jobs** refers to its entry there, whose link leads to the sibling file here.

**Leads.** The coaching site's contact page is the top of a sales funnel: it asks who is writing,
what they need and how soon, shows them the right next step at once, and gives Yasmina a pipeline
to follow up from. It mirrors **Support** and **Hiring** on purpose: an anonymous write behind
three limiters, two mails through the `Mailer` seam, a superadmin page, and a nightly prune.

## The page (`apps/www`)

`/kontakt` (Swedish by default, English through the `locale` cookie like every www page; the same
URL in both). A hero beside a sun card — `portraitOffice`, who Yasmina is, one line on what happens
after you write, and the response time ("Du får svar inom två arbetsdagar." / "You'll hear back
within two working days.") — and the form, `src/components/contact/contact-form.tsx`, a client
component over the booking journey's own stepper and step helpers (`StepIndicator`, `StepPanel`,
`StepNav`, `useBookingSteps`, `choiceClass`, `Fieldset`, reused unchanged):

1. **Vem skriver du för?** — `private` or `organisation` (radio cards).
2. **Vad behöver du?** — the need (`LEAD_NEEDS`: `coaching`, `inner_coaching`, `inner_mentoring`,
   `inner_lifestyle`, `team`, `talk`, `unsure`), how soon (`LEAD_TIMELINES`: `month`, `quarter`,
   `exploring`) and an optional "Berätta kort om din situation" (at most 2000 characters).
3. **Dina uppgifter** — name, email, phone (required only when "Via telefon" is picked),
   organisation (required) and role (optional), shown only for an organisation, the preferred
   contact method (e-mail preselected), a required consent box ("Yasmina får kontakta mig om det
   här ärendet.") and a separate, optional newsletter box. Neither box is ever pre-ticked.
4. **`/kontakt/tack`** — the reference, the tailored next step and "Vad händer nu" (three steps).

The browser checks each step before the next and the server checks everything again. Without
JavaScript every step shows at once (a `<noscript>` style, like the request form's), the stepper
and Continue buttons are hidden, the organisation fields show whatever was picked (the server
ignores them for a private person), and the one submit button posts a plain `<form action>`.
`?from=<path>` on `/kontakt` is carried as a hidden `page` field when it is a lowercase
root-relative path (`leadPage`; anything else is `/kontakt`). The site's own links send one through
`contactFrom` (`src/content/contact-links.ts`): the home teaser `?from=/`, the booking pages'
intro-call and no-JavaScript links `?from=/book`, and the blog's closing call to action
`?from=/blog/<slug>` (`/blog/en/<slug>` for an English post — a marker for "the blog", since
the blog is another host; the posts' own inline `www:/kontakt` links carry none). The header and
footer links carry none either. All copy is in `src/content/contact.ts` (`CONTACT`, both languages, one shape,
client-safe because the form reads `stepOf`, a function). `sendLeadCore` (`src/lib/leads.ts`,
tested) maps every refusal to that field's own message in the page's language, never Zod's English,
keeps what was typed, never sends a private person's organisation or role, and on success
`redirect()`s to `/kontakt/tack?ref=LEAD-<id>&for=…&need=…&when=…` — the reference and the three
fixed answers only. The done page re-checks all three (`parseDone`); a missing or unknown one shows
no tailored step rather than a guess, and the reference is shown only when it matches
`LEAD_REFERENCE_PATTERN` (`/^LEAD-\d{1,12}$/`) — any other `ref`, plain text included, renders
nothing, so the page can never be made to display a message of someone else's choosing. `/kontakt` is in the sitemap; `/kontakt/tack` is not and
`robots.ts` disallows it.

The home page's `#contact` section is a teaser now (a few lines and **Kontakta Yasmina** →
`/kontakt`); the waitlist form, its action and core left www (the `waitlist` api is untouched).
Every contact link points at `/kontakt`: the header's navigation, the footer's legal line, the
booking pages' intro-call and no-JavaScript links, and the blog's posts (`www:/kontakt`) and closing
call to action.

## The next step

`leadNextStep({ audience, need, timeline })` in `@repo/api-contract/leads` is the one rule both the
done page and the confirmation mail follow, returning a kind and a www path:

| Answers | Kind | Path |
|---|---|---|
| `unsure` (any timeline) | `explore` | `/inifran`, plus two blog posts in the page's language (`EXPLORE_POSTS`) |
| `team` | `proposal` — "Yasmina återkommer med ett förslag" | `/book/workshop` |
| `talk` | `proposal` | `/book/keynote` |
| a private person's `coaching`, or `inner_*`, timeline `exploring` | `explore` | `/inifran` |
| `coaching`, an organisation (any timeline) | `proposal` — coaching for its managers, quoted in writing | `/book/enterprise` |
| `coaching`, a private person | `coaching` — the free intro call, or book a coaching session | `/book/session` |
| `inner_coaching` / `inner_mentoring` / `inner_lifestyle` | `inner` — book the start call | `/book/inner_start_coaching` / `_mentoring` / `_lifestyle` |

Team days, workshops and talks get a proposal for a private person too (rare, and the request form
is the same). An organisation choosing one-to-one coaching never self-books a session: it gets a
proposal and the enterprise programme's request form. Someone only exploring coaching or the inifrån track is not pushed to book.

## The api (`leads.create`)

`leads.create` (`POST /leads`, service token only, no session) takes `LeadCreateSchema`
(`@repo/api-contract`'s `leads-schema.ts`; the Zod-free option lists, labels, limits, statuses,
`leadReference` and `leadNextStep` are the `@repo/api-contract/leads` subpath, `leads.ts`). Field
validation runs first (oRPC validates before the handler), then three limits like support's, all
before anything is stored: 5 per hour per client (`leads:<x-api-client-id>`, the action's
`anon:<ip hash>`), 3 per hour per typed address (`leads-to:<normalised email>`, since each lead
mails that address) and 100 per hour api-wide (`leads:global`), each `429` `LEAD_RATE_MESSAGE`
(`leadsRate`, translated). `submitLead` (`src/leads.ts`) then inserts the row and, in the same
transaction, queues both mails and the analytics event:

- `leadNew` to `BOOKING_EMAIL` — falling back to wherever support requests go (`SUPPORT_EMAIL`,
  else `MAIL_FROM`'s address), like bookings — in English with every answer as an English label
  (`LEAD_*_LABELS`), the typed values as plain text, `Reply-To:` the sender and a link to
  `${AUTH_URL}/admin/leads/<id>`.
- `leadReceived` to the sender, in the request's locale (`x-locale`, which www's action always
  sends): the reference, the reply time and the next step with its link (`wwwUrl` + path) only —
  never their message, name or organisation, since the address is whatever was typed (the same
  reasoning as `supportReceived`). `Reply-To:` Yasmina's inbox.

## Storage (`0036_leads`)

`leads`: `audience`, `need`, `timeline`, `message`, `name`, `email` (normalised), `phone`,
`organisation`, `role`, `contact_method`, `consent_at` (when the consent box was ticked — the
moment the lead arrived, since it is required), `newsletter` (0/1), `locale` (the supported locale
the request named, null for none), `page`, `ip_hash` (the client id, for abuse review), `status`
(`LEAD_STATUSES`: `new`, `contacted`, `call_booked`, `won`, `lost`), `notes` (Yasmina's),
`created_at`, `status_changed_at`, `status_changed_by` (no foreign key, like support's) and
`delete_after`. `ip_hash` is erased in the same update that moves a lead out of `new` (its
abuse-limiting job is done once Yasmina has picked the lead up, like a resolved support request's);
moving it back to `new` never restores it. Address-keyed like `job_applications`, never linked to an account: `users.purge`
leaves the rows (it nulls `status_changed_by` when the purged account is the admin who set it) and
`privacy.export`'s `leads` lists those sent from the account's own address only once it is
verified — the answers, never `ip_hash`, the notes or the admin.

**Newsletter consent is stored only.** There is no newsletter system: nothing reads `newsletter`
to send anything. Sending one later needs its own unsubscribe path and an updated `/privacy`.

## Retention

`LEAD_RETENTION_MONTHS` = 12: `delete_after` is twelve calendar months after `created_at`, and the
nightly `leads.prune` schedule (`10 4 * * *`; see **Jobs**) deletes every row past it in one
statement (idempotent; a lead has no file to clean up). Someone who asks to be forgotten sooner is
deleted by hand: `admin.leads.delete` (below). The legal app's privacy page (`apps/legal`) says both.

## Admin (`apps/auth`)

`admin.leads.list` (`GET /admin/leads`, `status` = a real status or `all`, the default; newest
first, keyset by id, 50 a page, plus `counts` per status whatever the filter), `admin.leads.get`
and `admin.leads.update` (`PATCH /admin/leads/{id}`, `status` and/or `notes`, at least one) are
superadmin-only (`NOT_FOUND` to anyone else, impersonation included), as is `admin.leads.delete`
(`DELETE /admin/leads/{id}`: the row, its answers and notes go at once; one `lead.deleted` audit row
names the lead's id only, no metadata; an id already gone is `NOT_FOUND`). `update` reads and writes in
one transaction; nothing changed (the same status, the same notes) is a no-op with no re-stamp and
no audit row, like `admin.applications.setStatus`; otherwise one `lead.updated` audit row
(`targetType` `lead`) carries `{ from, to }` for a status change and `{ notes: true }` for a notes
change — never the notes' text. Empty notes clear them.

`/admin/leads` (a **Leads** link in `AdminNav`) has a tab per status with its count (`All` first,
the sum), each lead as a link to `/admin/leads/<id>`: every answer, the next step the visitor was
shown, `mailto:` and `tel:` links, the message as plain text in a `whitespace-pre-wrap` block, the
newsletter answer ("stored only"), the language, the page, when it is deleted, and one form for the
status and the notes (`updateLeadCore`, `src/lib/admin-lead-actions.ts`, tested). The form posts
the status it was rendered with as `currentStatus`, and the status is sent only when the select
differs from it, so saving notes from a stale tab never puts back a status someone else has since
changed. Below it, **Delete lead…** opens a second step: a required "Yes, delete this lead
permanently" box (checked again on the server, `deleteLeadCore`) and **Delete permanently**, no
browser dialog; success lands on `/admin/leads?deleted=1`, which says "Lead deleted." in a status
region. English like the rest of `/admin`.

## Analytics

`lead_submitted` (`ANALYTICS_EVENTS`, `client: false`) is recorded by `submitLead` inside the
transaction with the three fixed answers as props (`audience`, `need`, `timeline`) and no user or
workspace id — never an address, a name or anything typed. The legal app's privacy page
(`apps/legal`) describes it under its account events.

## Tests

`apps/api/src/leads.test.ts` (create, both mails, locale, dropped fields, every refusal, the three
limits, the fallback inbox, the event, admin list/get/update and audit, prune, the export, purge),
`packages/api-contract/src/leads.test.ts` (the schema and `leadNextStep`), `packages/email`'s
`leads.test.tsx` and the `LeadNew` / `LeadReceived` stories, www's `src/lib/leads.test.ts`,
`src/content/contact.test.ts` and `views.test.tsx` (the steps, the no-JavaScript fallback, every
next step), auth's `admin-lead-actions.test.ts` and `admin-leads-view.test.tsx`, and
`apps/e2e/tests/contact.spec.ts` (a visitor's journey to a tailored next step and its mail, the
admin's follow-up, and the no-JavaScript form). `/kontakt`, `/kontakt/tack`, `/admin/leads` and
`/admin/leads/[id]` are in the a11y manifest and `perf/budgets.json`.
