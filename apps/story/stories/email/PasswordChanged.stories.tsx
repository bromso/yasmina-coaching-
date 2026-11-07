import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const accountUrl = "https://account.brand.com/security"
const resetUrl = "https://auth.brand.com/forgot-password"

const meta = {
  title: "Email/PasswordChanged",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: {
    render: () =>
      emails.passwordChanged({
        name: "Ada Lovelace",
        at: "2026-10-01T18:00:00.000Z",
        accountUrl,
        resetUrl,
      }),
  },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Your password was changed")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(accountUrl)
    await expect(canvas.getByTestId("text")).toHaveTextContent(resetUrl)
  },
}

export const Swedish: Story = {
  args: {
    render: () =>
      emails.passwordChanged(
        { name: "Ada Lovelace", at: "2026-10-01T18:00:00.000Z", accountUrl, resetUrl },
        "sv"
      ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Ditt lösenord har ändrats")
    )
  },
}
