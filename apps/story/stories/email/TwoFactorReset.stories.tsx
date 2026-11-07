import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const accountUrl = "https://account.brand.com"

const meta = {
  title: "Email/TwoFactorReset",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: {
    render: () => emails.twoFactorReset({ name: "Ada Lovelace", accountUrl }),
  },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Two-step verification was reset")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(`${accountUrl}/security`)
  },
}

export const Swedish: Story = {
  args: { render: () => emails.twoFactorReset({ name: "Ada Lovelace", accountUrl }, "sv") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Tvåstegsverifiering har återställts")
    )
  },
}
