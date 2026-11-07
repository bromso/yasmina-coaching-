import { ThemeToggle } from "@repo/ui/components/theme-toggle"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, userEvent, within } from "storybook/test"

const meta = {
  title: "Components/ThemeToggle",
  component: ThemeToggle,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta<typeof ThemeToggle>

export default meta
type Story = StoryObj<typeof meta>

/** Storybook has no `ThemeProvider`, so the click is a no-op here; use the toolbar theme switch. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: "Toggle theme" })
    await expect(button).toBeVisible()
    await userEvent.click(button)
  },
}
