# @repo/jobs

Jobs shell — Next.js 16 on jobs.brand.localhost:3006 in development, `jobs.brand.com` in production.

A jobs board: fumadocs-mdx over `content/jobs/<slug>.mdx`, headless (no `fumadocs-ui`), fully
static except its apply form — every other route is `○`/`●`, the shared
`/api/{analytics,health,telemetry}` handlers included. See CLAUDE.md's **Hiring.** paragraph for
the pipeline and the apply form's api side, and `docs/guides/content.md` for writing a posting.

```bash
bun --filter @repo/jobs dev       # http://jobs.brand.localhost:3006
bun --filter @repo/jobs build     # standalone output for docker/next.Dockerfile
bun --filter @repo/jobs analyze   # bundle report in .next/analyze/
```

## Routes

| Route | Dev URL |
|---|---|
| `/` | http://jobs.brand.localhost:3006 (open roles grouped by team, with a team filter row) |
| `/<slug>` | A posting: a facts list (team, location, employment, salary when set, posted/closes dates), its body, and either **Apply for this role** or a "This role is closed" notice; `JobPosting` JSON-LD for an open posting only |
| `/<slug>/apply` | The apply form — built only for open postings (`dynamicParams: false`); its server action, posting to `apps/api`'s `jobs.apply`, is the only runtime call |

Every app also serves `/offline` (the PWA fallback page) and `/api/health` (used by the Docker
health check).

## Writing a posting

See `docs/guides/content.md`'s "Writing jobs content" part: frontmatter (`team`, `location`,
`employment`, `posted`, `closes?`, `status`, `salary?`), the one-level-deep folder shape, and the
full table of what fails the build.

## Apply

`/<slug>/apply` is built only for an open posting; `src/components/apply-form.tsx` and
`src/lib/apply.ts` post a name, email, optional link and note, a required consent checkbox, and a
PDF CV (`CV_ACCEPT`, at most `MAX_CV_BYTES` = 5 MB) to `apps/api`'s `jobs.apply`, through the
`@repo/api-contract/jobs` subpath so the browser bundle skips the rest of the contract. The slug
is checked against the build's own open postings before anything else — a closed or unknown one
never reaches the api, and the title sent is always the build's, never the form's. A filled
honeypot field (`hp_field`, real visitors never see or fill it) answers success with no api call
at all. The page never translates: every message, including a `CV_UPLOAD_MESSAGE` refusal for an
api `BAD_REQUEST`, is shown in English regardless of the caller's locale — see CLAUDE.md's
**Hiring.** paragraph for the limits, the mails sent and the admin review on `apps/auth`'s
`/admin/applications`.

## Where things go

- **Views** — `src/views/<route>-view.tsx`: page-level compositions of `@repo/ui` blocks and
  components. Pages in `src/app/` stay thin and just render a view.
- **App-only components** — `src/components/`. Anything shared by two apps belongs in
  `packages/ui` instead.
- **Styles** — `src/styles/globals.css` starts with `@import "@repo/ui/globals.css";`; fonts, theme,
  skip link and web vitals come from `@repo/ui` too.

See the root [README](../../README.md) and [CLAUDE.md](../../CLAUDE.md) for the conventions shared by
all apps.
