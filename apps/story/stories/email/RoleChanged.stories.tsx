import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const props = {
  name: "Ada Lovelace",
  workspaceName: "Acme Ops",
  role: "admin",
  inboxUrl: "https://account.example.com/notifications",
  unsubscribeUrl: "https://auth.example.com/email/unsubscribe?token=abc.def",
}

const meta = {
  title: "Email/RoleChanged",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: {
    render: () => emails.roleChanged(props),
  },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Your role in Acme Ops changed")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(
      "Your role in Acme Ops is now admin."
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("Turn off these emails")
    await expect(canvas.getByTestId("text")).toHaveTextContent(props.unsubscribeUrl)
  },
}

export const Swedish: Story = {
  args: {
    render: () => emails.roleChanged(props, "sv"),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Din roll i Acme Ops har ändrats")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("Stäng av de här mejlen")
  },
}
