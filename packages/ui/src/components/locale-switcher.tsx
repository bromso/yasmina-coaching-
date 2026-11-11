"use client"

import { LOCALE_FLAGS } from "@repo/i18n/locales"
import { buttonVariants } from "@repo/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu"
import { Icon } from "@repo/ui/components/icon"
import { cn } from "@repo/ui/lib/utils"
import {
  type KeyboardEvent,
  type ReactElement,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"

export type LocaleOption = {
  value: string
  /** The language's name in that language (`LOCALE_NAMES` from `@repo/i18n`). */
  label: string
  /** An Iconify name for its flag; `LOCALE_FLAGS[value]` from `@repo/i18n/locales` by default. */
  flag?: string
}

export type LocaleSwitcherProps = {
  /** The current locale code: shown on the trigger and marked in the list. */
  current: string
  /** Every locale, each labelled in its own language (`LOCALE_NAMES` from `@repo/i18n`). */
  options: LocaleOption[]
  /**
   * Signed-in apps: a server action receiving `locale`. Every language is a submit button
   * (`name="locale" value=<code>`) inside a `<form action>`, so it works without JavaScript too.
   */
  action?: (formData: FormData) => void | Promise<void>
  /** Static apps: called with the chosen code when a language is activated (no form rendered). */
  onChange?: (value: string) => void
  /** Prefixes the trigger's accessible name ("Language: English"); the visible text is the name. */
  label?: string
  className?: string
}

const subscribeNever = () => () => {}

const triggerClass = cn(
  buttonVariants({ variant: "ghost" }),
  // 44 px tall (WCAG 2.5.5); the flag and the language's name stay visible at every width.
  "h-11 gap-2 px-3 font-normal"
)

const itemClass =
  "flex min-h-11 w-full items-center gap-2 rounded-sm px-2 text-left text-sm outline-hidden"

function flagFor(option: LocaleOption): string | undefined {
  return option.flag ?? (LOCALE_FLAGS as Record<string, string | undefined>)[option.value]
}

/**
 * A decorative flag. The bundled circle flags are squares (their id-bearing mask is stripped by
 * `bun icons:bundle`, so server and client markup agree): `rounded-full` makes them round.
 */
function Flag({ icon }: { icon: string | undefined }) {
  return icon ? (
    <Icon icon={icon} aria-hidden="true" className="size-5 overflow-hidden rounded-full" />
  ) : null
}

/** The trigger's (and the no-JS summary's) content: hidden label, flag, name, chevron. */
function TriggerContent({ label, option }: { label: string; option: LocaleOption | undefined }) {
  return (
    <>
      <span className="sr-only">{`${label}: `}</span>
      <Flag icon={option ? flagFor(option) : undefined} />
      <span lang={option?.value}>{option?.label}</span>
      <Icon icon="lucide:chevron-down" aria-hidden="true" className="size-4 opacity-60" />
    </>
  )
}

/** Every element a Tab press could land on, in document order. */
const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

/**
 * Tab inside the open menu: Radix keeps focus in the (portaled) list, but the menu-button pattern
 * closes the menu and moves on, so focus goes to the element after (or, with Shift, before) the
 * trigger in the page's own order.
 */
function focusBeside(trigger: HTMLElement, backwards: boolean): void {
  const all = Array.from(document.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (element) =>
      element === trigger ||
      (!element.closest("[inert]") &&
        !element.closest('[aria-hidden="true"]') &&
        element.getClientRects().length > 0)
  )
  const index = all.indexOf(trigger)
  const next = all[index + (backwards ? -1 : 1)]
  ;(next ?? trigger).focus()
}

/**
 * The header's language menu: a trigger showing the current language's flag and name, opening a
 * list of every language — each a button with its flag and its name in its own language — that
 * switches as soon as one is activated. That activation is an explicit choice (a click, Enter or
 * Space on an item), never a side effect of moving through the list, so WCAG 3.2.2 holds where an
 * auto-submitting `<select>` would not (arrow keys fire its `change` on every step). No
 * next-intl: all text arrives as props, English by default.
 *
 * Server-rendered (and so without JavaScript) it is a `<details>` disclosure: the summary looks
 * like the trigger, and with `action` every language is a submit button `name="locale"` inside a
 * `<form action>`, so a signed-in app's switch works with no script at all. Once hydrated (the
 * `useSyncExternalStore` probe `StaticLocaleSwitcher` uses) it becomes `@repo/ui`'s Radix
 * `DropdownMenu`: Enter, Space or ArrowDown open it, the arrow keys move, Escape closes it and
 * returns focus to the trigger, Tab closes it and moves on, a click outside closes it. The menu's
 * entrance animation is off under `prefers-reduced-motion`.
 */
export function LocaleSwitcher({
  current,
  options,
  action,
  onChange,
  label = "Language",
  className,
}: LocaleSwitcherProps): ReactElement {
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false
  )
  const [open, setOpen] = useState(false)
  // A new `current` (the action re-rendered the page, or a static app saved the cookie) closes
  // the menu, without remounting it: focus stays on the trigger.
  const [shownFor, setShownFor] = useState(current)
  if (shownFor !== current) {
    setShownFor(current)
    setOpen(false)
  }
  const trigger = useRef<HTMLButtonElement>(null)
  const tabbed = useRef<"forward" | "backward" | null>(null)
  const selected = options.find((option) => option.value === current)

  if (!hydrated) {
    const items = options.map((option) => (
      <li key={option.value}>
        <button
          type={action ? "submit" : "button"}
          name={action ? "locale" : undefined}
          value={action ? option.value : undefined}
          lang={option.value}
          aria-current={option.value === current ? "true" : undefined}
          className={cn(
            itemClass,
            "hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          )}
        >
          <Flag icon={flagFor(option)} />
          <span>{option.label}</span>
          {option.value === current && (
            <Icon icon="lucide:check" aria-hidden="true" className="ml-auto size-4" />
          )}
        </button>
      </li>
    ))
    const disclosure = (
      <details className="relative">
        <summary
          className={cn(
            triggerClass,
            "cursor-pointer list-none [&::-webkit-details-marker]:hidden"
          )}
        >
          <TriggerContent label={label} option={selected} />
        </summary>
        {/* Left-aligned where the header's controls wrap onto their own row (below sm), so the
            list never opens off the left edge of a 320 px screen; right-aligned above. */}
        <ul className="bg-popover text-popover-foreground absolute top-full left-0 z-50 mt-1 min-w-44 rounded-md border p-1 shadow-md sm:right-0 sm:left-auto">
          {items}
        </ul>
      </details>
    )
    return action ? (
      <form action={action} className={className}>
        {disclosure}
      </form>
    ) : (
      <div className={className}>{disclosure}</div>
    )
  }

  const submit = action
    ? async (formData: FormData) => {
        try {
          await action(formData)
        } finally {
          setOpen(false)
        }
      }
    : undefined

  const items = options.map((option) => (
    <DropdownMenuItem
      key={option.value}
      asChild
      // With a form, keep the menu (and so the form) mounted until the action lands: closing
      // first would unmount the form before its submit fires (`UserMenu`'s workspace items).
      onSelect={(event) => {
        if (action) event.preventDefault()
        else onChange?.(option.value)
      }}
      className={itemClass}
    >
      <button
        type={action ? "submit" : "button"}
        name={action ? "locale" : undefined}
        value={action ? option.value : undefined}
        lang={option.value}
        aria-current={option.value === current ? "true" : undefined}
      >
        <Flag icon={flagFor(option)} />
        <span>{option.label}</span>
        {option.value === current && (
          <Icon icon="lucide:check" aria-hidden="true" className="ml-auto size-4" />
        )}
      </button>
    </DropdownMenuItem>
  ))

  return (
    <div className={className}>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button ref={trigger} type="button" className={triggerClass}>
            <TriggerContent label={label} option={selected} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-44 motion-reduce:animate-none"
          onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
            if (event.key !== "Tab") return
            tabbed.current = event.shiftKey ? "backward" : "forward"
            setOpen(false)
          }}
          onCloseAutoFocus={(event) => {
            const direction = tabbed.current
            tabbed.current = null
            if (!direction || !trigger.current) return
            event.preventDefault()
            focusBeside(trigger.current, direction === "backward")
          }}
        >
          {submit ? <form action={submit}>{items}</form> : items}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
