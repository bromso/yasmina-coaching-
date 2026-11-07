import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const props = {
  name: "Ada Lovelace",
  workspaceName: "Acme Ops",
  plan: "team",
  inboxUrl: "https://account.example.com/notifications",
  unsubscribeUrl: "https://auth.example.com/email/unsubscribe?token=abc.def",
}

const meta = {
  title: "Email/PlanChanged",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: {
    render: () => emails.planChanged(props),
  },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Acme Ops is now on the Team plan")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("Acme Ops is now on the Team plan.")
    await expect(canvas.getByTestId("text")).toHaveTextContent("Turn off these emails")
    await expect(canvas.getByTestId("text")).toHaveTextContent(props.unsubscribeUrl)
  },
}

export const Swedish: Story = {
  args: {
    render: () => emails.planChanged(props, "sv"),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Acme Ops har nu planen Team")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("Stäng av de här mejlen")
  },
}
