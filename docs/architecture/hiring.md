# Hiring

Full reference; `CLAUDE.md` keeps the summary and the index. A bold name such as **Jobs** refers to its entry there, whose link leads to the sibling file here.

**Hiring.** `apps/jobs` is the jobs board: postings under `content/jobs/<slug>.mdx` (frontmatter
`team`, `location`, `employment`, `posted`, `closes?`, `status`, `salary?`; a posting is open when
`status` is `open` and, when `closes` is set, that date has not passed), the fourth
`@repo/content` app (see **Content** above and `docs/guides/content.md`). Routes: `/` (open roles
grouped by team, alphabetically, with a team filter row — a closed posting never appears), `/<slug>`
(the posting, `JobPosting` JSON-LD for open roles only) and `/<slug>/apply`, built only for open
roles (`dynamicParams: false`), so a closed or unknown slug's apply route does not exist.

The apply form (`apps/jobs/src/components/apply-form.tsx`, `src/lib/apply.ts`) posts to
`jobs.apply` in `@repo/api-contract`, reached through its own `@repo/api-contract/jobs` subpath
(limits and messages, like `support.ts`) so the browser bundle skips the rest of the contract. A
filled honeypot (`hp_field`) answers success with no api call; the slug is checked against the
build's own open postings first, so a closed or unknown one never reaches the api and the title
sent is always the build's, never the form's; the CV (a PDF, at most `MAX_CV_BYTES` = 5 MB) and the
consent checkbox are this form's own rules, checked before the api ever sees the input — the api's
own field validation (`JobApplySchema`, a Zod schema) still runs ahead of `jobs.apply`'s three rate
limits, since oRPC validates input before a handler's body runs. The page never translates and
always shows English, including `CV_UPLOAD_MESSAGE` for an api `BAD_REQUEST` (the same reasoning as
its `TOO_MANY_REQUESTS` branch) — the api's own message is already in the caller's locale, so the
page cannot trust it as English. Its server action needs `API_URL` / `API_SERVICE_TOKEN` at boot,
like `apps/www`'s waitlist and `apps/help`'s contact form; `next.config.mjs` raises
`experimental.serverActions.bodySizeLimit` to `6mb` (Next's 1 MB default would refuse the
multipart CV before `MAX_CV_BYTES` ever runs).

`jobs.apply` is anonymous, like `support.create`. Three limits, all before anything is read or
stored: `jobs:<x-api-client-id>` (the apply action's own `anon:<ip hash>` client id, 3 per hour),
`jobs-to:<normalised email>` (3 per day) and `jobs:global` (50 per hour api-wide), each `429`
`JOBS_RATE_MESSAGE` "Too many applications, try again later.". Past them, the CV is read and
checked as a real PDF (size from `File.size` first, so an oversized file is never read) and stored
under a fresh key, `applications/<22-char random>.pdf` (`CV_KEY_PATTERN` — no id segment, unlike
`avatars/<userId>/<random>.<ext>`, since an application has no account to namespace by); one
transaction then inserts the `job_applications` row and queues both mails — `jobApplication` to
`HIRING_EMAIL` (falling back to wherever support requests go: `SUPPORT_EMAIL`, else `MAIL_FROM`'s
address; `Reply-To:` the applicant) and `jobApplicationReceived` to the applicant (the role and
reference only, never their own text, the same reasoning as `supportReceived`; `Reply-To:` the
hiring inbox). A failed commit queues the CV just written for `storage.delete` rather than leave
it orphaned.

Superadmins review applications on `apps/auth`'s `/admin/applications` (status tabs — `all` first
and the default, then `new` / `reviewing` / `rejected` / `hired` — and a role-slug filter, both
plain GET forms, so both work without JavaScript): `admin.applications.setStatus` is a no-op with
no re-stamp and no audit row when the status given is already the row's (the same guard
`admin.support.resolve` uses), and `admin.applications.delete` deletes the row and queues its CV
for `storage.delete` itself, in the same transaction, rather than leave it to the nightly sweep;
`admin.applications.cv` streams the CV as `<reference>-<name>.pdf` — the only way a CV is ever
served (never `files.get`, never a public route). Applications are kept 6 months
(`APPLICATION_RETENTION_MONTHS`); the nightly `applications.prune` schedule (`50 3 * * *`; see
**Jobs**) deletes every row past its `delete_after` and queues its CV. The data export (**Privacy**
above) lists `jobApplications` sent from the account's own address only once that address is
verified — applications are address-keyed, not account-linked, so `users.purge` never touches them
and an application outlives the account that sent it, the same as a support request.
