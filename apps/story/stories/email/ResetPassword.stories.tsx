import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const link = "https://auth.brand.com/reset-password?token=example"

const meta = {
  title: "Email/ResetPassword",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.resetPassword({ name: "Ada Lovelace", link }) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Reset your password")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(link)
  },
}

export const Swedish: Story = {
  args: { render: () => emails.resetPassword({ name: "Ada Lovelace", link }, "sv") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Återställ ditt lösenord")
    )
  },
}
