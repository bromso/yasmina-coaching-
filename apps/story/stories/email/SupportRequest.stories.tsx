import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const adminUrl = "https://auth.brand.com/admin/support/req_123"
const props = {
  reference: "req_123",
  topic: "Billing",
  email: "ada@example.com",
  name: "Ada Lovelace",
  page: "/account/payments",
  message: "My invoice total looks wrong this month.\n\nCan you take a look?",
  adminUrl,
}

const meta = {
  title: "Email/SupportRequest",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.supportRequest(props) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "New support request req_123: Billing"
      )
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(adminUrl)
    await expect(canvas.getByTestId("text")).toHaveTextContent("My invoice total looks wrong")
  },
}

export const WithoutName: Story = {
  args: { render: () => emails.supportRequest({ ...props, name: undefined }) },
}

export const Swedish: Story = {
  args: { render: () => emails.supportRequest(props, "sv") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "Ny supportförfrågan req_123: Billing"
      )
    )
  },
}
