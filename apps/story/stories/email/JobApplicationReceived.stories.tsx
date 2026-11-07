import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const props = { reference: "APP-123", title: "Senior Engineer" }

const meta = {
  title: "Email/JobApplicationReceived",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.jobApplicationReceived(props) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "We've received your application (APP-123)"
      )
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("we'll be in touch")
  },
}

export const Swedish: Story = {
  args: { render: () => emails.jobApplicationReceived(props, "sv") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "Vi har tagit emot din ansökan (APP-123)"
      )
    )
  },
}
