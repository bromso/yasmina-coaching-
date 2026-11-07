import { BRAND_NAME } from "@repo/sites"
import { SiteHeader } from "@repo/ui/blocks/site-header"
import { Brand } from "@repo/ui/components/brand"
import { LocaleSwitcher } from "@repo/ui/components/locale-switcher"
import { SignInLink } from "@repo/ui/components/sign-in-link"
import { ThemeToggle } from "@repo/ui/components/theme-toggle"
import { UserMenu } from "@repo/ui/components/user-menu"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"

const links = [
  { label: "App", href: "https://app.brand.com" },
  { label: "Docs", href: "https://docs.brand.com", current: true },
  { label: "Help", href: "https://help.brand.com" },
  { label: "Jobs", href: "https://jobs.brand.com" },
]

const meta = {
  title: "Blocks/SiteHeader",
  component: SiteHeader,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    brand: <Brand href="https://www.brand.com" />,
    links,
    controls: <ThemeToggle />,
    end: <SignInLink authUrl="https://auth.brand.com" />,
  },
} satisfies Meta<typeof SiteHeader>

export default meta
type Story = StoryObj<typeof meta>

export const Static: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("banner")).toBeInTheDocument()
    const nav = canvas.getByRole("navigation", { name: "Site" })
    await expect(within(nav).getByText("Docs")).toHaveAttribute("aria-current", "page")
    await expect(within(nav).queryByRole("link", { name: "Docs" })).toBeNull()
    // Keyboard order: the brand, every nav link (the current app is text, so it is skipped),
    // then the end controls. The hamburger is display:none at this width and never takes focus.
    await userEvent.tab()
    await expect(canvas.getByRole("link", { name: BRAND_NAME })).toHaveFocus()
    const linked = links.filter((link) => !link.current)
    await expect(within(nav).getAllByRole("link")).toHaveLength(linked.length)
    for (const link of linked) {
      await userEvent.tab()
      await expect(within(nav).getByRole("link", { name: link.label })).toHaveFocus()
    }
    await userEvent.tab()
    await expect(canvas.getByRole("button", { name: "Toggle theme" })).toHaveFocus()
    await userEvent.tab()
    await expect(canvas.getByRole("link", { name: "Sign in" })).toHaveFocus()
  },
}

const signedInControls = (
  <>
    <LocaleSwitcher
      current="en"
      options={[
        { value: "en", label: "English" },
        { value: "sv", label: "Svenska" },
      ]}
      action={async () => {}}
    />
    <ThemeToggle />
  </>
)

const userMenu = (
  <UserMenu
    user={{ name: "Ada Lovelace", email: "ada@example.com" }}
    accountUrl="https://account.brand.com"
    signOut={async () => {}}
  />
)

export const SignedIn: Story = {
  args: { controls: signedInControls, end: userMenu },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole("button", { name: "Account menu for Ada Lovelace" })
    ).toBeInTheDocument()
  },
}

export const Sticky: Story = {
  args: { sticky: true },
}

export const Mobile: Story = {
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // Below md the inline nav is display:none, so it is out of the accessibility tree.
    await expect(canvas.queryByRole("navigation", { name: "Site" })).toBeNull()
    const trigger = canvas.getByRole("button", { name: "Open menu" })
    trigger.focus()
    await userEvent.keyboard("{Enter}")
    const sheet = await within(document.body).findByRole("dialog", { name: "Menu" })
    // All four apps: three links plus the current one as text.
    await expect(within(sheet).getAllByRole("link")).toHaveLength(3)
    await expect(within(sheet).getByRole("link", { name: "App" })).toHaveAttribute(
      "href",
      "https://app.brand.com"
    )
    await expect(within(sheet).getByRole("link", { name: "Help" })).toBeInTheDocument()
    await expect(within(sheet).getByRole("link", { name: "Jobs" })).toBeInTheDocument()
    await expect(within(sheet).getByText("Docs")).toHaveAttribute("aria-current", "page")
    await userEvent.keyboard("{Escape}")
    await waitFor(() =>
      expect(within(document.body).queryByRole("dialog", { name: "Menu" })).toBeNull()
    )
    await expect(trigger).toHaveFocus()
  },
}

/**
 * WCAG 1.4.10 at 320 CSS px (`mobile1`): the row keeps the brand, the primary action and the
 * hamburger; the secondary controls (locale form, theme toggle) wrap onto their own row below it.
 * Nothing scrolls sideways and every control stays in the page — the locale switcher a real form.
 */
export const Narrow: Story = {
  args: { controls: signedInControls, end: userMenu },
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const doc = canvasElement.ownerDocument.documentElement
    await expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth)
    const brand = canvas.getByRole("link", { name: BRAND_NAME })
    const menu = canvas.getByRole("button", { name: "Account menu for Ada Lovelace" })
    const hamburger = canvas.getByRole("button", { name: "Open menu" })
    const select = canvas.getByRole("combobox", { name: "Language" })
    const theme = canvas.getByRole("button", { name: "Toggle theme" })
    for (const el of [brand, menu, hamburger, select, theme]) await expect(el).toBeVisible()
    await expect(select.closest("form")).not.toBeNull()
    // Row one: brand, menu and hamburger share a line; the controls sit below it.
    const rowOne = brand.getBoundingClientRect()
    const middle = (rect: DOMRect) => rect.top + rect.height / 2
    await expect(Math.abs(middle(menu.getBoundingClientRect()) - middle(rowOne))).toBeLessThan(6)
    await expect(select.getBoundingClientRect().top).toBeGreaterThanOrEqual(rowOne.bottom)
    for (const el of [brand, menu, hamburger, select, theme]) {
      await expect(el.getBoundingClientRect().right).toBeLessThanOrEqual(doc.clientWidth)
    }
  },
}
