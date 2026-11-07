import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const link = "https://auth.brand.com/verify-email?token=example"

const meta = {
  title: "Email/VerifyEmail",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.verifyEmail({ name: "Ada Lovelace", link }) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Verify your email")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(link)
  },
}

export const WithoutName: Story = { args: { render: () => emails.verifyEmail({ link }) } }

export const Swedish: Story = {
  args: { render: () => emails.verifyEmail({ name: "Ada Lovelace", link }, "sv") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Verifiera din e-postadress")
    )
  },
}
