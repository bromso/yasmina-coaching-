# add-mdx-page output assertions

After running this skill on the prompt "add a /pricing page to the marketing site", the following must be true:

- [ ] New file at `apps/www/src/app/pricing/page.mdx` (or `apps/www/src/app/pricing/page.tsx` + content file)
- [ ] File exports a `metadata` object with `title` and `description`
- [ ] If custom MDX components are introduced, `apps/www/mdx-components.tsx` (or wherever it lives) is extended, not replaced
- [ ] No new file created under `apps/app/`  (wrong app)
- [ ] Plan mentions running `bun --filter @repo/www dev` to verify
