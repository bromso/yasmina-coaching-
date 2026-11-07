import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const props = {
  name: "Ada Lovelace",
  workspaceName: "Acme Ops",
  host: "hooks.example.com",
  failures: 5,
  link: "https://account.example.com/workspace",
}

const meta = {
  title: "Email/WebhookDisabled",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: {
    render: () => emails.webhookDisabled({ ...props, reason: "failures" }),
  },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const AfterFailures: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("A webhook endpoint was turned off")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("after 5 deliveries in a row failed")
    await expect(canvas.getByTestId("text")).toHaveTextContent("hooks.example.com")
  },
}

export const Gone: Story = {
  args: {
    render: () => emails.webhookDisabled({ ...props, reason: "gone" }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByTestId("text")).toHaveTextContent("410 Gone"))
  },
}

export const Swedish: Story = {
  args: {
    render: () => emails.webhookDisabled({ ...props, reason: "failures" }, "sv"),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("En webhook-mottagare har stängts av")
    )
  },
}
