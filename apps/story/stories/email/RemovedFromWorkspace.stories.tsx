import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const props = {
  name: "Ada Lovelace",
  workspaceName: "Acme Ops",
  inboxUrl: "https://account.example.com/notifications",
  unsubscribeUrl: "https://auth.example.com/email/unsubscribe?token=abc.def",
}

const meta = {
  title: "Email/RemovedFromWorkspace",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: {
    render: () => emails.removedFromWorkspace(props),
  },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("You were removed from Acme Ops")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(
      "You are no longer a member of Acme Ops"
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("Turn off these emails")
    await expect(canvas.getByTestId("text")).toHaveTextContent(props.unsubscribeUrl)
  },
}

export const Swedish: Story = {
  args: {
    render: () => emails.removedFromWorkspace(props, "sv"),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Du har tagits bort från Acme Ops")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("Stäng av de här mejlen")
  },
}
