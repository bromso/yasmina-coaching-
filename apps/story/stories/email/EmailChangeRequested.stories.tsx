import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const link = "https://auth.brand.com/email/cancel?token=example"
const maskedEmail = "n***@example.com"

const meta = {
  title: "Email/EmailChangeRequested",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.emailChangeRequested({ name: "Ada Lovelace", maskedEmail, link }) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Your email address is changing")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(maskedEmail)
    await expect(canvas.getByTestId("text")).toHaveTextContent(link)
  },
}

export const Swedish: Story = {
  args: {
    render: () => emails.emailChangeRequested({ name: "Ada Lovelace", maskedEmail, link }, "sv"),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "Din e-postadress håller på att ändras"
      )
    )
  },
}
