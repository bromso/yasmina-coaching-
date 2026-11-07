# @repo/i18n

Locales, browser-language negotiation, the `locale` cookie, UTC date formatting and the ICU message
catalogs. Five subpaths, like `@repo/telemetry`:

```ts
import { LOCALES, DEFAULT_LOCALE, LOCALE_NAMES, isLocale, negotiateLocale, resolveLocale } from "@repo/i18n/locales"
import { LOCALE_COOKIE, LOCALE_MAX_AGE, parseLocaleCookie, localeCookie } from "@repo/i18n/cookie"
import { formatUtcDate, SWEDISH_MONTHS } from "@repo/i18n/dates"
import { messagesFor, type Namespace, type Messages } from "@repo/i18n/messages"
import { translatorFor } from "@repo/i18n/translate"
```

## `locales`

`LOCALES = ["en", "sv"] as const`, `DEFAULT_LOCALE = "en"`, `LOCALE_NAMES` (each language's own
name: `{ en: "English", sv: "Svenska" }`, for a switcher — never translated into the other
language). `isLocale(value)` narrows `unknown` to `Locale`.

`negotiateLocale(acceptLanguage)` parses an `Accept-Language` header: splits on `,` first and keeps
only the first 50 parts (`MAX_TAGS`) — bounding parse cost without ever slicing a tag in half, the
way a character-count cap could — then reads each tag's `;q=` weight (default `1`, a malformed q or
an out-of-range one drops that tag, not the rest of the header), sorts by weight (ties keep header
order — the sort is stable), then for each tag in that order tries its exact code first and then its
language subtag (`sv-SE` → `sv`) before moving to the next tag. No match at all, or no header, is
`en`.

`resolveLocale({ saved, cookie, acceptLanguage })` is the request-wide resolution order: a signed-in
user's saved preference, else the `locale` cookie, else the negotiated header, else `en`. An
invalid `saved` or `cookie` value is ignored outright rather than treated as a hard stop.
`resolveLocaleWithSource(...)` returns `{ locale, source }` with `source` one of `"saved"`,
`"cookie"`, `"header"` or `"default"` — `default` when nothing named a supported locale (a `de`
browser), so a caller can tell a real signal from the English fallback.

This module has zero dependencies — not even `zod` — on purpose: `@repo/api-contract` and browser
bundles need to import it without pulling in anything else.

## `cookie`

`LOCALE_COOKIE = "locale"`, one year (`LOCALE_MAX_AGE`). Mirrors
`packages/ui/src/lib/consent.ts`'s shape exactly: `parseLocaleCookie(cookieHeader)` is a tolerant,
hand-rolled parse (the first recognised value among possibly several cookies wins; anything not a
supported locale is `null`, not thrown). `localeCookieAttributes(locale, { domain, secure })` is the
one structured definition (`{ name, value, maxAge, path, sameSite, domain, secure, httpOnly: false }`,
which `@repo/session` passes to Next's `cookies().set`), and `localeCookie(locale, { domain, secure })`
builds from it a `Set-Cookie`-valid string — `Path=/`, `SameSite=Lax`, `Domain` only when given, `Secure` only over
https, and deliberately **no `HttpOnly`**: a static app's switcher writes this cookie from a client
component, and every app reads it back.

## `dates`

`formatUtcDate(iso, locale, { time? })` prints a date (and, with `time`, a 24-hour time) in UTC,
for dates that render under a client component in `apps/app` and `apps/account`: the server
render and the hydrated browser must print the same string. English uses `Intl`'s `dateStyle:
"medium"` / `timeStyle: "short"` ("Mar 4, 2026"); Swedish is built by hand from `SWEDISH_MONTHS`
("4 mars 2026 05:06"), a fixed 12-entry table of today's CLDR abbreviations, because the runtime's
Swedish abbreviations and its combined date-time pattern have both changed across ICU releases
and the server's ICU need not match the browser's. Client-safe: no import outside this package.

## `messages`

`messages/<locale>/<namespace>.json` for `common`, `ui`, `auth`, `app`, `account`, `email` and `api` — imported
statically (never read from disk), so every catalog bundles into Next's client and server output
alike. English is the source of truth; `Namespace` and `Messages` are derived from its shape. The
raw JSON imports, the two types and the merge primitive live in `src/catalog.ts`, an internal
module with no `package.json` "exports" entry — only this package's own modules and tests reach it,
by relative path.

`messagesFor(locale, namespaces)` returns `{ [namespace]: deepMerge(en[namespace],
locale[namespace]) }` — English recursively merged under the locale, so a key the locale hasn't
translated yet still renders in English rather than vanishing. `messagesFor` is the public entry
point; `deepMerge` and the raw, unmerged `ALL_LOCALE_MESSAGES` stay in `./catalog`, for its own unit
tests and for the catalog-parity / ICU-validity checks below.

Adding a language: add it to `LOCALES` and its own name to `LOCALE_NAMES` (`src/locales.ts`), add a
`messages/<locale>/` folder with the seven namespace files, import them in `src/catalog.ts` and add
the locale to `ALL_LOCALE_MESSAGES` there, and fill in the keys the catalog-parity test (below)
lists as missing. See `docs/guides/i18n.md`'s **Adding a language**.

## `translate`

`translatorFor(locale, namespace)` wraps `use-intl/core`'s `createTranslator` for callers with no
React and no Next request context — `apps/api`'s user-facing error messages and `@repo/email`'s
templates, both of which know the recipient's locale up front rather than reading it from the
current request. It never throws: English is merged in under the locale before `createTranslator`
ever sees the messages, so a key missing from the locale's own catalog resolves to English without
reaching the fallback. The fallback (`getMessageFallback` / `onError`) only fires for a key missing
from English too, which returns the raw key (so a test can catch it), and for an ICU error while
formatting an otherwise-present message (a malformed translation, say), which returns the
unformatted English string rather than a bare key path.

The mechanism is `createTranslatorFrom(locale, namespace, catalogs)`, parameterised over the
catalogs it reads; `translatorFor` is just this, closed over the real, shipped
`ALL_LOCALE_MESSAGES`. It is exported (there is no separate internal module here, unlike
`messages`/`catalog`) so the package's own tests can inject fixture catalogs — a key present in
English but missing from another locale, or a locale message that is actually broken ICU — and
prove the fallback end to end, without ever editing the real catalog files to create a gap on
purpose.

## Testing

Every namespace's catalog parity is covered in `src/messages.test.ts`: each locale's *own*
(unmerged) file (`./catalog`'s `ALL_LOCALE_MESSAGES`) is flattened to its key set and compared to
English's — unlike `messagesFor`, whose whole point is that the merged result always equals
English's keys, this check reads the raw files so it actually catches a gap as later tasks add
keys. The same file asserts every message string in every locale compiles as valid ICU, by calling
`t(key, {})` for each leaf — **passing no values at all skips ICU compilation outright** (verified
against the installed `use-intl@4.14.9`: a message as broken as `"{unclosed"` comes back unchanged,
with no error raised), so `{}` is what actually forces the compile-and-format pass. `onError`
records only `IntlErrorCode.INVALID_MESSAGE` (use-intl's code for a genuine ICU syntax error) as a
failure, never `IntlErrorCode.FORMATTING_ERROR` (which a valid plural or select would also raise
here, just from being called with no real values) — a small fixture-based test proves the detector
itself actually flags an unclosed brace, unbalanced braces, a plural missing its required `other`
case and a typo'd plural keyword, and does *not* flag a valid plural called with no values, before
the real catalogs are checked against it. This needs only `use-intl`, already a dependency, rather
than reaching for its own `intl-messageformat` dependency directly (which Bun's isolated installer
would refuse to resolve from this workspace without declaring it, and this task adds no dependency
beyond `use-intl`).
