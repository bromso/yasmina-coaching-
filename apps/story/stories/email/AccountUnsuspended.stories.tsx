import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const meta = {
  title: "Email/AccountUnsuspended",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: {
    render: () => emails.accountUnsuspended({ name: "Ada Lovelace" }),
  },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Your account is no longer suspended")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("sign in as usual")
  },
}

export const Swedish: Story = {
  args: {
    render: () => emails.accountUnsuspended({ name: "Ada Lovelace" }, "sv"),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Ditt konto är inte längre avstängt")
    )
  },
}
