# add-ui-component output assertions

After running this skill on the prompt "add a Badge component to the shared UI package", the following must be true:

- [ ] New file at `packages/ui/src/components/badge.tsx` (lowercase filename)
- [ ] Component named `Badge` (PascalCase)
- [ ] Accepts `className` prop and merges with `cn()` from `@repo/ui/lib/utils`
- [ ] Spreads remaining props
- [ ] If multiple variants, uses `cva` from `class-variance-authority`
- [ ] New Storybook story at `apps/story/stories/Badge.stories.tsx` with at least 2 stories
- [ ] Story imports from `@repo/ui/components/badge`
- [ ] Story has `tags: ["autodocs"]`
- [ ] No new file created under `apps/app/src/components/` (this is the wrong place)
- [ ] Plan does NOT suggest running shadcn CLI without `-c packages/ui`
