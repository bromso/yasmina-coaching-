# Support

Full reference; `CLAUDE.md` keeps the summary and the index. A bold name such as **Jobs** refers to its entry there, whose link leads to the sibling file here.

**Support.** `apps/help` is the help center: categories and articles under
`content/articles/<category>/<article>.mdx`, the same `@repo/content` engine the blog and docs use
(see **Content** above and `docs/guides/content.md`), but its own `meta.json` dialect — plain
slugs only, no separators, rest tokens, icons or link entries (help has no sidebar tree); a
category's `meta.json` must carry a `description` (a missing one fails the build naming the real
file, even one with no `meta.json` of its own), and `meta.yaml` / `meta.yml` is refused like the
other two content apps. Routes: `/` (search and popular articles), `/<category>`,
`/<category>/<article>` (up to three related articles by shared tags, and a "Contact us" link
carrying its own path), `/all`, a static `/api/search` index behind the ⌘K/Ctrl K dialog —
`@repo/ui/blocks/docs-search`'s own `labels` prop renames every string ("Search help" rather than
"Search docs"), so the block itself stays unchanged for `apps/docs` — and `/contact`, static and
listed in the sitemap like every other route.

The contact form (`apps/help/src/components/contact-form.tsx`, `src/app/contact/actions.ts`) posts
to `support.create` in `@repo/api-contract` (`SUPPORT_TOPICS`, `supportReference` and friends are
also their own `@repo/api-contract/support` subpath export, so the browser bundle pulls in only
this file, not the whole contract); the action builds its api client the way `anonymousApi` does
but keeps the `anon:<ip hash>` client id and sets `x-session-token` itself, so a signed-in
visitor's request still links their account without flipping the rate-limit bucket to a
per-session one. Limits, api-wide, checked before anything is stored: 5 per hour per client
(`support:<x-api-client-id>`), 3 per hour per typed address (`support-to:<normalised email>`,
since each request mails that address) and 100 per hour api-wide (`support:global`) — see
`apps/api/README.md`'s own Support paragraph. `page` (the article the visitor came from, carried
as a hidden field) is dropped rather than refused when it is missing, too long or not a help path
— the request is still stored and mailed, just without that context. The api mails two templates:
`supportRequest` to `SUPPORT_EMAIL` (`Reply-To:` the sender, a link to `/admin/support`) and
`supportReceived` to the sender — the reference and a generic greeting only, never a copy of their
message or name, since the address is whatever was typed and anyone could type anyone else's.
Superadmins see every request on `apps/auth`'s `/admin/support` (open / resolved / all tabs) and
resolve or reopen it (`admin.support.resolve` / `reopen`, both `{ ok: true }`); `resolvedBy` on a
resolved request names the admin who resolved it.
