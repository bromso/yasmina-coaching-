# Help center (Phase 8 B) — design

Phase 8 finishes what is unfinished: A Data & privacy (#82, merged) → B Help center (this spec) →
C Jobs board. Approved in chat on 2026-10-10.

## Intent

`apps/help` is an empty shell ("This is a clean shell…"). It becomes a real help center: articles
anyone can browse and search, and a contact form whose messages reach a support inbox and an admin
list. Success: a visitor finds an answer or sends a request and gets a reference; a superadmin sees
and resolves requests. The articles describe how this starter actually behaves, so they double as
end-user documentation.

Decided with the owner: contact messages are **stored, emailed to support, confirmed to the sender,
and listed on `/admin/support`**; the content reuses the docs engine's approach with
**help-specific modules modelled on `apps/docs`, not a shared engine package** (yet).

## 1. Content and pages (`apps/help`)

**Content.** MDX under `apps/help/content/articles/<category>/<article>.mdx`, a `meta.json` per folder
ordering categories and articles (fumadocs `defineDocs`, as `apps/docs`; `source.config.ts` imports the
schema by relative path, `postinstall: fumadocs-mdx`, `.source/` git-ignored — CLAUDE.md step 10).
- Frontmatter: `helpFrontmatterSchema` in `@repo/content` (strict): `title`, `description`
  (required), `updated?` (date), `tags` (default `[]`, lowercase kebab-case), `popular?` (boolean),
  `type` (default `"Help Article"`, OKF-ready like the blog's and docs').
- Build gate (`assembleHelp` in `apps/help/src/lib/help-core.ts`, one `ContentError` like docs'):
  `meta.json` entries matching no page or folder, a body `#` h1, broken / non-root-relative /
  local-host links, missing images under `public/`, a page under a reserved top-level name (`all`,
  `contact`, `og`, `api`, `opengraph-image`, `twitter-image`, `manifest.webmanifest`, `sitemap.xml`,
  `robots.txt`), and an article nested deeper than `<category>/<article>`. Shared checks from
  `@repo/content` (`checks`, `links`).
- Starter content — four categories, two or three articles each, accurate to this codebase:
  Getting started (create an account; invite your team), Account & security (turn on two-step
  verification; export or delete your data), Workspaces & billing (roles and what each can do;
  change your plan), Troubleshooting (I didn't get the email; I was signed out).

**Routes** (fully static except the contact action):
- `/` — a search field (the docs search dialog), "Popular articles" (`popular: true`), and one card
  per category (title, description from the category's `meta.json` `description`, article count).
- `/<category>` — the category's articles (title + description), in `meta.json` order.
- `/<category>/<article>` — breadcrumbs (Help › Category), the article, a table of contents when it
  has two or more `##` headings (`Toc` + `TocActive`), "Last updated" when set, "Related articles"
  (up to 3: shared tags, same category first, then others), and a "Still need help? Contact us" link
  to `/contact?from=<path>`.
- `/all` — every article by category: the search dialog's no-JavaScript fallback.
- `/api/search` — `force-static`, `createFromSource` (fumadocs-core's bundled engine), as docs.
- `/contact` — §2.
- Per-article OG/Twitter images (as docs' `/og/<path>/image.png` route handler), `sitemap.ts`
  (articles, `lastModified` from `updated`), `robots.ts` allowing everything.

**Reuse.** `@repo/ui` blocks (`breadcrumbs`, `docs-search`, `Cards`/`Card`, `toc`, `toc-active`, the
MDX component maps) and `@repo/content`. App-local `src/lib/` modules (`help-core.ts`, `nav.ts`,
`search-results.ts`, `og.ts`, `sitemap.ts`) modelled on `apps/docs/src/lib`. No shared engine package.
The shell's unused dependencies are removed (re-confirmed by grep, as in `apps/app`).

**Language.** English, like the other static apps; the static language switcher stays. Translated
help content is out of scope.

## 2. Contact

**Form (`/contact`)** — email (required), name (optional), topic (`account` | `billing` | `bug` |
`other`, labelled Account / Billing / Something isn't working / Something else), message (10–5000
characters), hidden `page` (the `from` query, validated as a root-relative help path, else empty), a
hidden honeypot field (`website`): non-empty → answer success without sending. A plain
`<form action>` with `useActionState`, works without JavaScript; the page stays static (`○`). Success:
"Thanks — we've got it. Your reference is #HELP-<id>. We've sent a copy to <email>." Errors per field
(`@repo/ui` form-feedback). Copy English.

**Server action** (`apps/help/src/app/contact/actions.ts`, core in `src/lib/contact.ts` with tests):
calls `support.create` with the service token, the visitor's ip as the rate-limit key
(`requestInfo(headers).ip`, as www's waitlist), `x-locale` from a real signal (`resolveWaitlistLocale`'s
approach — extract a shared helper if it can live in `@repo/session` without pulling session-only
code), and the shared `session` cookie's token forwarded as `x-session-token` when present so the api
can link the request. `apps/help` gains `API_URL` / `API_SERVICE_TOKEN` (optional like telemetry: in
production without them the form answers "Support is unavailable right now").

**API.**
- Migration `0020_support`: `support_requests` (`id`, `email`, `name`, `topic`, `message`, `page`,
  `user_id` nullable, `ip_hash`, `status` `open` | `resolved`, `created_at`, `resolved_at`,
  `resolved_by` nullable).
- `support.create({ email, name?, topic, message, page? })` — anonymous (bearer-guarded, like
  `waitlist.join`); an optional `x-session-token` that resolves to a live, non-impersonation session
  links `user_id`. Limits: 5 per ip-hash per hour (`support:<ip hash>`), 100 per hour api-wide.
  Stores the row, enqueues (in the same transaction) `supportRequest` to `SUPPORT_EMAIL` (`Reply-To:`
  the sender) and `supportReceived` to the sender in the request's locale. Returns
  `{ reference: "HELP-<id>" }`.
- `SUPPORT_EMAIL` (api, optional): unset → `MAIL_FROM`'s address; the api warns at startup in
  production when unset.
- The `Mailer` seam gains `replyTo?` on `Message` (all four providers pass it through).
- Privacy: `privacy.export` adds `supportRequests` (the user's linked requests); `users.purge` sets
  `support_requests.user_id = NULL` (the typed email stays, like the waitlist — documented).

**Admin** (`apps/auth` `/admin/support`, superadmin only, `NOT_FOUND` otherwise, `AdminNav` link):
newest first, filter Open / Resolved / All, each row: reference, topic, email, linked user (link to
`/admin/users/<id>` when set), page, created, message (expandable), **Mark resolved** / **Reopen**.
Procedures `admin.support.list({ status?, cursor? })`, `admin.support.resolve({ id })`,
`admin.support.reopen({ id })` — audited `support.resolved` / `support.reopened`.

**Email** (`@repo/email`, en + sv, test + story each): `supportRequest` (to support: topic, from,
name, page, message, admin link), `supportReceived` (to the sender: reference, a copy of the message,
"we'll reply to this address").

## 3. Testing and delivery

- api (SQLite + Postgres): create (validation, honeypot is the action's job — the api never sees
  it), limits, both mails with `replyTo`, user linking (valid session links; impersonation and no
  session do not), admin list/filter/resolve/reopen/audit, non-admin `NOT_FOUND`, export field,
  purge unlinking.
- help: `assembleHelp` checks, nav, search results, related articles, sitemap, OG; the contact core
  (validation, honeypot, unavailable, success reference).
- e2e: open an article from a category, search finds an article, send the form → reference shown;
  as a superadmin, find it on `/admin/support` and resolve it.
- Docs: CLAUDE.md (`apps/help` description, a **Support.** paragraph, the env table row for
  `SUPPORT_EMAIL`, the help app in the e2e list if it joins), `apps/help/README.md` (new),
  `apps/api/README.md`, `apps/auth/README.md`, `packages/email/README.md`, `docs/guides/content.md`
  (help as the third content app); ROADMAP ticks A and lists B.

## Out of scope

A ticketing system (threads, replies in-app, assignment), attachments, a "Was this helpful?" widget,
translated articles, live chat, a shared docs-engine package.
