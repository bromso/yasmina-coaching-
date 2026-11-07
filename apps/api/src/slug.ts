/** Lowercase, `[a-z0-9-]`, 3–50 chars; derived from a workspace name and never a secret. */
export function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
  return base.length >= 3 ? base : `${base ? `${base}-` : ""}workspace`
}

/** `base`, `base-2`, `base-3`, … — the first candidate `exists` says is free. */
export async function uniqueSlug(
  name: string,
  exists: (slug: string) => Promise<boolean>
): Promise<string> {
  const base = slugify(name)
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? base : `${base.slice(0, 50 - String(n).length - 1)}-${n}`
    if (!(await exists(candidate))) return candidate
  }
}
