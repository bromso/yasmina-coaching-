import { ImpersonationBanner } from "@repo/ui/components/impersonation-banner"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/ImpersonationBanner",
  component: ImpersonationBanner,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    name: "Ada Lovelace",
    email: "ada@example.com",
    reason: "support ticket #12",
    expiresAt: "2026-06-01T13:05:00.000Z",
    stopUrl: "https://auth.brand.com/admin/stop",
  },
} satisfies Meta<typeof ImpersonationBanner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Viewing as Ada Lovelace (ada@example.com)"
    )
    await expect(canvas.getByRole("link", { name: "Stop impersonating" })).toHaveAttribute(
      "href",
      "https://auth.brand.com/admin/stop"
    )
  },
}

export const NoName: Story = { args: { name: "" } }
