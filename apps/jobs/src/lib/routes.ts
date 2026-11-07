/** The routes besides the posting pages themselves (which come from content/jobs, plus the home
 * page, handled specially in `src/lib/sitemap.ts` as `apps/help`'s own does). Nothing else is a
 * static, always-public top-level route: `/<slug>/apply` is per-posting and open-roles-only. */
export const PUBLIC_ROUTES: string[] = []
