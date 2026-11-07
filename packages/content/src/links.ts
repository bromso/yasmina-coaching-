const IGNORED_SCHEME = /^(mailto|tel):/i
/** Any other URI scheme (`data:`, `ftp:`, …) — not ours to check, so it is left alone. */
const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/**
 * Drops the query string and fragment, so `/tags/x?y=1#z` compares as `/tags/x`, then strips one
 * trailing slash (except for `/` itself) so `/a-post/` compares as `/a-post`.
 */
function normalizePath(path: string): string {
  const bare = path.split(/[?#]/)[0] ?? path
  return bare.length > 1 && bare.endsWith("/") ? bare.slice(0, -1) : bare
}

/** The registrable part shared by every app's host: `docs.brand.localhost` → `brand.localhost`. */
function siteDomain(ownHost: string): string {
  return (ownHost.split(":")[0] ?? ownHost).replace(/^[^.]+\./, "")
}

/** A loopback IPv4 address: the whole `127.0.0.0/8` block (a `URL` has already normalised
 * shorthand like `127.1` to dotted-quad form). */
const LOOPBACK_V4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

/**
 * Only ever a development machine: `localhost` itself or any `*.localhost` name (RFC 6761), a
 * loopback IPv4 address, the unspecified `0.0.0.0`, or IPv6 loopback (`[::1]`, as `URL.hostname`
 * writes it).
 */
function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    LOOPBACK_V4.test(host) ||
    host === "0.0.0.0" ||
    host === "[::1]"
  )
}

export function checkLinks(
  input: { file: string; links: string[] }[],
  known: { paths: Set<string>; hosts: Set<string>; ownHost: string }
): string[] {
  const problems: string[] = []
  const domain = siteDomain(known.ownHost)
  const ownIsLocal = isLocalHost(known.ownHost.split(":")[0] ?? known.ownHost)

  function checkAbsolute(url: URL, href: string, file: string) {
    // A build for a real domain must not ship a link to someone's development machine.
    if (!ownIsLocal && isLocalHost(url.hostname)) {
      problems.push(`${file}: link "${href}" points at a local development host`)
      return
    }

    const sameFamily = url.hostname === domain || url.hostname.endsWith(`.${domain}`)
    if (!sameFamily) return // genuinely external, fine

    const host = url.port ? `${url.hostname}:${url.port}` : url.hostname
    if (host === known.ownHost) {
      if (!known.paths.has(normalizePath(url.pathname))) {
        problems.push(`${file}: broken link "${href}"`)
      }
      return
    }

    if (!known.hosts.has(host)) {
      problems.push(`${file}: unknown app "${host}" in link "${href}"`)
    }
  }

  for (const { file, links } of input) {
    for (const href of links) {
      if (href.startsWith("#") || IGNORED_SCHEME.test(href)) continue

      // Protocol-relative: same origin resolution as an absolute link, so it is checked the same
      // way — before the root-relative branch, which a bare "/" prefix would otherwise match.
      if (href.startsWith("//")) {
        try {
          checkAbsolute(new URL(`https:${href}`), href, file)
        } catch {
          problems.push(`${file}: invalid link "${href}"`)
        }
        continue
      }

      if (href.startsWith("/")) {
        if (!known.paths.has(normalizePath(href))) {
          problems.push(`${file}: broken link "${href}"`)
        }
        continue
      }

      if (/^https?:\/\//i.test(href)) {
        try {
          checkAbsolute(new URL(href), href, file)
        } catch {
          problems.push(`${file}: invalid link "${href}"`)
        }
        continue
      }

      if (OTHER_SCHEME.test(href)) continue

      // Every relative href must be root-relative: "a-post", "./x" and "../tags/x" cannot be
      // resolved without knowing the current page's own path, so they are refused outright.
      problems.push(`${file}: link "${href}" must be root-relative (start with "/")`)
    }
  }

  return problems
}
