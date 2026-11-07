import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const props = { reference: "HELP-123" }

const meta = {
  title: "Email/SupportReceived",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.supportReceived(props) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "We've received your request (HELP-123)"
      )
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("reply to this email address")
  },
}

export const Swedish: Story = {
  args: { render: () => emails.supportReceived(props, "sv") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "Vi har tagit emot din förfrågan (HELP-123)"
      )
    )
  },
}
