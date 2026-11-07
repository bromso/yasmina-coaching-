"use client"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@repo/ui/components/command"
import { Icon } from "@repo/ui/components/icon"
import { type MouseEvent, type ReactElement, useEffect, useRef, useState } from "react"

export interface DocsSearchResult {
  id: string
  title: string
  href: string
  kind: "page" | "heading" | "text"
  excerpt?: string
}

/** Every string this block renders, so a caller whose index isn't "the docs" (`apps/help`'s own
 * search, say) can rename it without forking the block. Each key defaults to today's exact
 * English (see `DEFAULT_DOCS_SEARCH_LABELS`), so an app that passes none is unaffected. */
export type DocsSearchLabels = {
  /** Both the no-JS fallback link's text and the hydrated button's own label. */
  trigger?: string
  /** The dialog's accessible title (`CommandDialog`'s `title`). */
  dialogTitle?: string
  /** The dialog's accessible description (`CommandDialog`'s `description`). */
  description?: string
  /** The search input's placeholder. */
  placeholder?: string
  /** Shown while the query is blank, prompting the visitor to type. */
  hint?: string
  /** Shown while a query is running (including the first one, which also downloads the index). */
  loading?: string
  /** Shown for a finished query with zero hits. */
  noResults?: string
  /** The text before the fallback link, shown when the search itself failed. */
  unavailable?: string
  /** The fallback link's own text, inside the `unavailable` message. */
  unavailableLink?: string
}

export type DocsSearchProps = {
  /** The no-JS fallback target: a plain list of every page (e.g. "/all"). */
  fallbackHref: string
  query: string
  onQueryChange: (query: string) => void
  /** The hits; `"loading"` while a query runs, `"empty"` (or `[]`) for none, `"error"` when the
   * search itself failed (e.g. its index could not be fetched). Ignored while `query` is blank,
   * which shows a hint instead. */
  results: DocsSearchResult[] | "loading" | "empty" | "error"
  /** Where a result navigates to. Defaults to a full navigation (`location.assign`); pass a
   * `next/navigation` router's `push` (or similar) for a client-side one. */
  onNavigate?: (href: string) => void
  /** Overrides any of the block's strings; every key defaults to today's English, so omitting
   * this prop entirely leaves `apps/docs` (and anyone else) unchanged. */
  labels?: DocsSearchLabels
}

/** Today's exact English, unchanged from before `labels` existed. */
export const DEFAULT_DOCS_SEARCH_LABELS: Required<DocsSearchLabels> = {
  trigger: "Search docs",
  dialogTitle: "Search docs",
  description: "Search the documentation",
  placeholder: "Search docs...",
  hint: "Type to search the docs",
  loading: "Searching…",
  noResults: "No results",
  unavailable: "Search is unavailable — ",
  unavailableLink: "browse all pages",
}

const KIND_LABEL: Record<DocsSearchResult["kind"], string | undefined> = {
  page: undefined,
  heading: "Section",
  text: "Mention",
}

const TRIGGER_CLASS =
  "flex w-full items-center gap-2 rounded-md border bg-background px-3 py-2 text-left text-muted-foreground text-sm transition-colors hover:border-foreground/30"

/** Mac, iPhone, iPad, iPod — anywhere ⌘ is the modifier convention rather than Ctrl. Shared by
 * `useShortcutLabel` (the hint's wording) and the shortcut listener below (which modifier
 * `isSearchShortcut` should require), so the two can't disagree about the platform. */
function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
}

/**
 * The platform-dependent shortcut hint, read from `navigator` after mount only. The server (and
 * the first client render, before this effect runs) has no reliable `navigator.userAgent` to key
 * off, so reading it during render would make hydration's first paint disagree between server and
 * client; `null` until the effect runs keeps both renders identical.
 */
function useShortcutLabel(): string | null {
  const [label, setLabel] = useState<string | null>(null)
  useEffect(() => {
    setLabel(isMacPlatform() ? "⌘K" : "Ctrl K")
  }, [])
  return label
}

/**
 * Whether a `keydown` event is the search shortcut for the given platform: on Mac, ⌘K held
 * without Ctrl; elsewhere, Ctrl+K held without ⌘ — so Ctrl+K doesn't also fire inside a Mac text
 * field (where it's a cursor-movement shortcut) and ⌘+K doesn't fire on Windows/Linux (where ⌘
 * doesn't exist as a modifier at all, but a synthetic event could still claim it). Shift or Alt
 * held at the same time means no match on either platform. A pure function, independent of any
 * real `KeyboardEvent` and told the platform rather than detecting it itself, so the matching
 * rule is unit-testable for both platforms on its own.
 */
export function isSearchShortcut(
  event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">,
  isMac: boolean
): boolean {
  if (event.key?.toLowerCase() !== "k" || event.shiftKey || event.altKey) return false
  return isMac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey
}

/**
 * Whether a click on a result's `<a>` is a plain primary click — button 0, no modifier — that
 * should be handed to `onSelect` instead of the browser. Anything else (a modifier click opening
 * a new tab/window, a middle click, …) isn't: the browser already knows what to do with those,
 * and letting `onSelect` *also* fire would navigate the current tab on top of it. A pure
 * function, independent of any real `MouseEvent`, so the split is unit-testable on its own.
 */
export function isPlainLeftClick(
  event: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">
): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

/**
 * The docs search control. Before hydration — including the server render — it's a plain `<a>` to
 * `fallbackHref` (a full page listing, e.g. "/all"), styled to look like a search field: a working
 * substitute with no JavaScript. `useShortcutLabel` only resolves after mount, so that's also
 * exactly when this swaps to the real button; there is no separate hydration flag to keep in
 * sync. Once mounted, the button opens `CommandDialog` (`shouldFilter={false}`, forwarded via
 * `commandProps` — the caller does the searching via `query`/`onQueryChange` and supplies
 * `results`), toggled by Ctrl/⌘+K anywhere on the page and closed by Escape (the dialog's own
 * default). Each result's option is itself a plain `<a href>` (`CommandItem asChild`), never a
 * link nested inside an option: a plain click is handed to `onSelect` (which navigates via
 * `onNavigate` when given, else `location.assign`) rather than the browser, so the two can't
 * both fire; a modifier click is left entirely to the browser.
 * Enter on the selected item has no click to intercept at all — it reaches `onSelect` directly.
 */
export function DocsSearch({
  fallbackHref,
  query,
  onQueryChange,
  results,
  onNavigate,
  labels,
}: DocsSearchProps): ReactElement {
  const t = { ...DEFAULT_DOCS_SEARCH_LABELS, ...labels }
  const shortcut = useShortcutLabel()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    // Deliberately global (attached to `document`, not the search input): this is the one
    // listener that *opens* the dialog in the first place, so it has to work from anywhere on
    // the page, not only once the search field already has focus. The platform is read once per
    // mount, same as useShortcutLabel's own (the two never disagree — see isMacPlatform).
    const isMac = isMacPlatform()
    function onKeyDown(event: KeyboardEvent) {
      // IME composition can fire a `keydown` with a placeholder `key` ("Process") or none at
      // all, same as some autofill interactions — `isSearchShortcut`'s own `?.` guards the
      // latter, but composition is better skipped outright rather than matched against.
      if (event.isComposing) return
      if (!isSearchShortcut(event, isMac)) return
      event.preventDefault()
      setOpen((value) => !value)
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [])

  function navigate(href: string) {
    // Close first: a client-side onNavigate (a router push) would otherwise leave the dialog
    // open over whatever page it navigates to.
    setOpen(false)
    if (onNavigate) onNavigate(href)
    else window.location.assign(href)
  }

  // Set by a modifier or non-primary click on a result, so the option's own `onSelect` (cmdk's
  // click handler on the same element, which runs right after the <a>'s) skips that click.
  const modifierClick = useRef(false)

  function onResultClick(event: MouseEvent<HTMLAnchorElement>) {
    if (isPlainLeftClick(event)) {
      // Block the <a>'s own navigation; cmdk's click handler on the same element then calls
      // onSelect (above), which does the navigating instead — one navigation, not two.
      event.preventDefault()
    } else {
      // A modifier click or non-primary button: let the browser's own default handling (new
      // tab, new window, …) run, and tell onSelect not to navigate this tab as well.
      modifierClick.current = true
    }
  }

  if (!shortcut) {
    return (
      <a href={fallbackHref} data-slot="docs-search" className={TRIGGER_CLASS}>
        <Icon icon="lucide:search" aria-hidden="true" />
        <span>{t.trigger}</span>
      </a>
    )
  }

  // A blank query is a prompt to type, not a search that found nothing.
  const isBlank = query.trim() === ""
  const isLoading = !isBlank && results === "loading"
  const isError = !isBlank && results === "error"
  const list = !isBlank && Array.isArray(results) ? results : []
  // An explicit "empty" and a zero-length array both read as "nothing to show" — the caller
  // shouldn't have to normalise [] to the "empty" sentinel itself.
  const hasNoResults = !isBlank && !isLoading && !isError && list.length === 0

  return (
    <>
      <button
        type="button"
        data-slot="docs-search"
        className={TRIGGER_CLASS}
        onClick={() => setOpen(true)}
      >
        <Icon icon="lucide:search" aria-hidden="true" />
        <span className="flex-1">{t.trigger}</span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
          {shortcut}
        </kbd>
      </button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title={t.dialogTitle}
        description={t.description}
        commandProps={{ shouldFilter: false }}
      >
        <CommandInput value={query} onValueChange={onQueryChange} placeholder={t.placeholder} />
        <CommandList>
          {isBlank && <CommandEmpty>{t.hint}</CommandEmpty>}
          {isLoading && <CommandEmpty>{t.loading}</CommandEmpty>}
          {isError && (
            <CommandEmpty>
              {t.unavailable}
              <a href={fallbackHref} className="underline underline-offset-4">
                {t.unavailableLink}
              </a>
            </CommandEmpty>
          )}
          {hasNoResults && <CommandEmpty>{t.noResults}</CommandEmpty>}
          {list.length > 0 && (
            <CommandGroup heading="Results">
              {list.map((result) => (
                <CommandItem
                  key={result.id}
                  value={result.id}
                  // The option *is* the link (cmdk's Item is a Radix Primitive, so `asChild`
                  // renders its `role="option"` onto the <a>): an option's children are
                  // presentational, so an <a> nested inside one is a second interactive control
                  // that assistive tech can't reach (axe's nested-interactive). `role="option"` is
                  // an allowed role for `a[href]`.
                  asChild
                  onSelect={() => {
                    if (modifierClick.current) {
                      modifierClick.current = false
                      return
                    }
                    navigate(result.href)
                  }}
                  className="flex-col items-start gap-0.5"
                >
                  <a
                    href={result.href}
                    // Not a tab stop: cmdk moves its own virtual selection (aria-activedescendant
                    // from the input), so every option in the tab order would only add stops.
                    tabIndex={-1}
                    onClick={onResultClick}
                  >
                    <span className="flex items-center gap-2">
                      {KIND_LABEL[result.kind] && (
                        <span className="text-muted-foreground text-xs uppercase">
                          {KIND_LABEL[result.kind]}
                        </span>
                      )}
                      <span>{result.title}</span>
                    </span>
                    {result.excerpt && (
                      <span className="text-muted-foreground text-xs">{result.excerpt}</span>
                    )}
                  </a>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
