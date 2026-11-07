import { type DocsNavNode, DocsSidebar } from "@repo/ui/blocks/docs-sidebar"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"

const items: DocsNavNode[] = [
  { type: "separator", title: "Guides" },
  { type: "page", title: "Getting started", href: "/docs/getting-started" },
  {
    type: "folder",
    title: "Authentication",
    href: "/docs/authentication",
    children: [
      { type: "page", title: "OAuth", href: "/docs/authentication/oauth" },
      { type: "page", title: "Magic link", href: "/docs/authentication/magic-link" },
    ],
  },
  {
    type: "folder",
    title: "Architecture",
    children: [{ type: "page", title: "Overview", href: "/docs/architecture/overview" }],
  },
]

const meta = {
  title: "Blocks/DocsSidebar",
  component: DocsSidebar,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  args: {
    items,
    currentHref: "/docs/getting-started",
  },
} satisfies Meta<typeof DocsSidebar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("navigation", { name: "Docs" })).toBeInTheDocument()
    await expect(canvas.getByRole("link", { name: "Getting started" })).toHaveAttribute(
      "aria-current",
      "page"
    )
  },
}

export const CurrentPageInsideAFolder: Story = {
  args: { currentHref: "/docs/authentication/oauth" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("link", { name: "OAuth" })).toHaveAttribute(
      "aria-current",
      "page"
    )
  },
}

/** Review Focus 1: a folder with no index page renders as a non-link group, never a 404 waiting
 * to happen. */
export const FolderWithoutAnIndexPage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole("link", { name: "Architecture" })).not.toBeInTheDocument()
    await expect(canvas.getByText("Architecture")).toBeInTheDocument()
  },
}

/** The toggle's accessible name ("Toggle <title>", sr-only) stays separate from the folder's own
 * link next to it — so a screen reader doesn't confuse "expand this group" with "go to this
 * page" (both used to read as just the folder's title, since the link used to live inside the
 * `<summary>`). */
export const FolderToggleHasItsOwnAccessibleName: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText("Toggle Authentication")).toBeInTheDocument()
    await expect(canvas.getByRole("link", { name: "Authentication" })).toHaveAttribute(
      "href",
      "/docs/authentication"
    )
  },
}

/** The folder's toggle and its nested page list are the native `<details>`/`<summary>` pairing —
 * clicking the (separately positioned, 28px) toggle reveals the list, same as any `<details>`.
 * Asserted on the `<details>` element's own `open` property directly: a closed `<details>`'s
 * hidden content isn't exposed as `display: none` the way dom-testing-library's role queries
 * check for "hidden" (that's a UA-internal slotting mechanism, not a literal computed style), so
 * `queryByRole(...).not.toBeInTheDocument()` can't tell open from closed here — `details.open`
 * can. */
export const TogglingRevealsNestedPages: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const toggle = canvas.getByText("Toggle Authentication").closest("summary")
    const details = toggle?.closest("details")
    if (!toggle || !details) throw new Error("Authentication's toggle <details> was not found")
    expect(details.open).toBe(false)
    await userEvent.click(toggle)
    expect(details.open).toBe(true)
    await expect(canvas.getByRole("link", { name: "OAuth" })).toBeInTheDocument()
  },
}

/** A folder without an href has no separate link at all — the whole row, title included, is the
 * `<summary>` — so clicking the title itself (not a dedicated toggle button) expands it. */
export const ClickingANoHrefFolderTitleToggles: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const title = canvas.getByText("Architecture")
    const details = title.closest("details")
    if (!details) throw new Error("Architecture's <details> was not found")
    expect(details.open).toBe(false)
    await userEvent.click(title)
    expect(details.open).toBe(true)
    await expect(canvas.getByRole("link", { name: "Overview" })).toBeInTheDocument()
  },
}

export const CustomLabel: Story = {
  args: { label: "On this site" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("navigation", { name: "On this site" })).toBeInTheDocument()
  },
}

/** A titled separator is a plain list item holding its title in a `<span>` (no
 * `role="presentation"`, so axe's `list` rule passes); an untitled one is an `<hr>` in its item. */
export const Separators: Story = {
  args: {
    items: [
      { type: "separator", title: "Start here" },
      { type: "page", title: "Getting started", href: "/docs/getting-started" },
      { type: "separator" },
      { type: "page", title: "Deploying", href: "/docs/deploying" },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const title = canvas.getByText("Start here")
    await expect(title.tagName).toBe("SPAN")
    await expect(title.closest("li")).not.toHaveAttribute("role")
    await expect(canvas.getAllByRole("listitem")).toHaveLength(4)
    await expect(canvas.getByRole("separator")).toBeInTheDocument()
  },
}
