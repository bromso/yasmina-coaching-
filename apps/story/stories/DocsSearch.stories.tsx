import { DocsSearch, type DocsSearchResult } from "@repo/ui/blocks/docs-search"
import type { Meta, StoryObj } from "@storybook/react-vite"
import * as React from "react"
import { expect, fn, userEvent, waitFor, within } from "storybook/test"

const SAMPLE_RESULTS: DocsSearchResult[] = [
  {
    id: "getting-started",
    title: "Getting started",
    href: "/docs/getting-started",
    kind: "page",
  },
  {
    id: "oauth-providers",
    title: "Setting up OAuth providers",
    href: "/docs/authentication#oauth-providers",
    kind: "heading",
    excerpt: "Configure Google, GitHub and Apple sign-in.",
  },
]

const meta = {
  title: "Blocks/DocsSearch",
  component: DocsSearch,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    fallbackHref: "/all",
    query: "",
    onQueryChange: () => {},
    results: "empty",
  },
} satisfies Meta<typeof DocsSearch>

export default meta
type Story = StoryObj<typeof meta>

/** The interactive control, post-hydration: a button with the shortcut hint that opens the
 * dialog. */
export const Default: Story = {
  render: function Render(args) {
    const [query, setQuery] = React.useState(args.query)
    return <DocsSearch {...args} query={query} onQueryChange={setQuery} />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole("button", { name: /search docs/i })).toBeInTheDocument()
    // The bug this guards against: an earlier version rendered the dialog's sr-only title as a
    // sibling of DialogContent rather than inside it (inside its Portal), so it mounted
    // unconditionally — an invisible <h2>Search docs</h2> ahead of the page's own <h1>, even
    // while the dialog was closed.
    expect(document.querySelector("h2")).toBeNull()
  },
}

/** Ctrl/⌘+K toggles the dialog open and closed, from anywhere on the page — not just once the
 * search field itself has focus. Platform-specific (⌘K on Mac, Ctrl+K elsewhere) since fix round
 * 2, so this presses whichever one this browser's own platform actually requires — the same
 * `navigator.userAgent` check `DocsSearch` itself makes — rather than hardcoding one that would
 * only pass on a matching CI runner. */
export const ToggledByShortcut: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await canvas.findByRole("button", { name: /search docs/i })
    expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument()

    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
    const shortcut = isMac ? "{Meta>}k{/Meta}" : "{Control>}k{/Control}"

    await userEvent.keyboard(shortcut)
    await expect(await within(document.body).findByRole("dialog")).toBeInTheDocument()

    await userEvent.keyboard(shortcut)
    // Radix keeps the closed dialog mounted for its exit animation before actually removing it
    // from the DOM, so this has to wait rather than check immediately.
    await waitFor(() => {
      expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument()
    })
  },
}

export const Loading: Story = {
  args: { query: "setup", results: "loading" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = await canvas.findByRole("button", { name: /search docs/i })
    await userEvent.click(button)
    const dialog = await within(document.body).findByRole("dialog")
    await expect(await within(dialog).findByText("Searching…")).toBeInTheDocument()
  },
}

export const NoResults: Story = {
  args: { query: "zzz", results: "empty" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = await canvas.findByRole("button", { name: /search docs/i })
    await userEvent.click(button)
    const dialog = await within(document.body).findByRole("dialog")
    await expect(await within(dialog).findByText("No results")).toBeInTheDocument()
  },
}

export const WithResults: Story = {
  args: { query: "setup", results: SAMPLE_RESULTS },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = await canvas.findByRole("button", { name: /search docs/i })
    await userEvent.click(button)
    const dialog = await within(document.body).findByRole("dialog")
    await expect(await within(dialog).findByText("Getting started")).toBeInTheDocument()
    await expect(within(dialog).getByText("Setting up OAuth providers")).toBeInTheDocument()
    await expect(
      within(dialog).getByText("Configure Google, GitHub and Apple sign-in.")
    ).toBeInTheDocument()
    // Each option is itself the link, never an option with a link nested inside it (an option's
    // children are presentational, so a nested <a> is an interactive control assistive tech
    // can't reach — axe's nested-interactive).
    const options = within(dialog).getAllByRole("option")
    expect(options.map((option) => option.getAttribute("href"))).toEqual([
      "/docs/getting-started",
      "/docs/authentication#oauth-providers",
    ])
    for (const option of options) {
      expect(option.tagName).toBe("A")
      expect(option.querySelector("a, button, input, [tabindex]")).toBeNull()
    }
  },
}

/** Before anything is typed the dialog asks for a query, whatever `results` holds: a blank query is
 * not a search that found nothing. */
export const BlankQueryShowsHint: Story = {
  args: { query: "  ", results: "empty" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = await canvas.findByRole("button", { name: /search docs/i })
    await userEvent.click(button)
    const dialog = await within(document.body).findByRole("dialog")
    await expect(await within(dialog).findByText("Type to search the docs")).toBeInTheDocument()
    expect(within(dialog).queryByText("No results")).not.toBeInTheDocument()
  },
}

/** The search failed (its index could not be fetched): the dialog says so and links to the full
 * page list, the same target as the no-JavaScript fallback. */
export const SearchUnavailable: Story = {
  args: { query: "setup", results: "error" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = await canvas.findByRole("button", { name: /search docs/i })
    await userEvent.click(button)
    const dialog = await within(document.body).findByRole("dialog")
    await expect(await within(dialog).findByText(/Search is unavailable/)).toBeInTheDocument()
    const link = within(dialog).getByRole("link", { name: "browse all pages" })
    await expect(link).toHaveAttribute("href", "/all")
  },
}

/** An empty results array reads the same as the "empty" sentinel — the caller shouldn't have to
 * normalise the two. */
export const EmptyArrayShowsNoResults: Story = {
  args: { query: "zzz", results: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const button = await canvas.findByRole("button", { name: /search docs/i })
    await userEvent.click(button)
    const dialog = await within(document.body).findByRole("dialog")
    await expect(await within(dialog).findByText("No results")).toBeInTheDocument()
  },
}

/** Clicking a result navigates exactly once (cmdk's `CommandItem` calls `onSelect` on every
 * click, and the option — itself an `<a>` — would also navigate on its own if left alone — the click
 * classification inside `DocsSearch`, `isPlainLeftClick`, is what keeps a plain click from
 * triggering both) and closes the dialog — a client-side `onNavigate` (a router push, as here)
 * doesn't actually leave the page, so nothing else would close it. */
export const ClickingAResultCallsOnNavigateOnce: Story = {
  args: {
    query: "setup",
    results: SAMPLE_RESULTS,
    onNavigate: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    const button = await canvas.findByRole("button", { name: /search docs/i })
    await userEvent.click(button)
    const dialog = await within(document.body).findByRole("dialog")
    const result = await within(dialog).findByText("Getting started")
    await userEvent.click(result)
    await expect(args.onNavigate).toHaveBeenCalledTimes(1)
    await expect(args.onNavigate).toHaveBeenCalledWith("/docs/getting-started")
    // Radix keeps a closing dialog mounted for its exit animation, so this waits rather than
    // checking immediately (same as ToggledByShortcut above).
    await waitFor(() => {
      expect(within(document.body).queryByRole("dialog")).not.toBeInTheDocument()
    })
  },
}
