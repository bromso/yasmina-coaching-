/**
 * "Edit on GitHub"'s target: `repoUrl` (the build-time `CONTENT_REPO_URL`, e.g.
 * `https://github.com/<owner>/<repo>/blob/main/apps/docs/content/docs`) joined with the page's file
 * relative to content/docs, with exactly one slash between them. Unset or blank means no link.
 */
export function editUrlFor(repoUrl: string | undefined, path: string): string | undefined {
  const base = repoUrl?.trim()
  if (!base) return undefined
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
}
