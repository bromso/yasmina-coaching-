import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const meta = {
  title: "Email/AccountDeleted",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: {
    render: () => emails.accountDeleted({ name: "Ada Lovelace" }),
  },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Your account has been deleted")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("shown as a deleted user")
  },
}

export const Swedish: Story = {
  args: { render: () => emails.accountDeleted({ name: "Ada Lovelace" }, "sv") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Ditt konto har raderats")
    )
  },
}
