import { navPill } from "@repo/ui/components/nav-pill"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const items = ["Overview", "Users", "Bookings", "Leads"]

/** `navPill()`: a section's tabs in the site header's pill shape, the current one filled. */
const meta = {
  title: "Components/Navigation/NavPill",
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  render: () => (
    <nav aria-label="Admin" className="flex flex-wrap gap-1">
      {items.map((label) => (
        <a
          key={label}
          href={`#${label.toLowerCase()}`}
          aria-current={label === "Bookings" ? "page" : undefined}
          className={navPill({ current: label === "Bookings" })}
        >
          {label}
        </a>
      ))}
    </nav>
  ),
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const nav = within(canvasElement).getByRole("navigation", { name: "Admin" })
    const current = within(nav).getByRole("link", { name: "Bookings" })
    await expect(current).toHaveAttribute("aria-current", "page")
    // A pill: the radius is at least half the 32px height.
    await expect(
      Number.parseFloat(getComputedStyle(current).borderTopLeftRadius)
    ).toBeGreaterThanOrEqual(16)
    const other = within(nav).getByRole("link", { name: "Users" })
    await expect(getComputedStyle(current).backgroundColor).not.toBe(
      getComputedStyle(other).backgroundColor
    )
  },
}

/** `size: "md"`: 36 px, next to the h-9 controls of a header row, as in the blog's nav. */
export const Medium: Story = {
  render: () => (
    <ul className="flex flex-wrap items-center gap-2">
      {["Ledarskap inifrån", "English"].map((label) => (
        <li key={label}>
          <a href={`#${label}`} className={navPill({ size: "md", className: "text-foreground" })}>
            {label}
          </a>
        </li>
      ))}
    </ul>
  ),
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole("link", { name: "English" })
    await expect(link.getBoundingClientRect().height).toBe(36)
  },
}
