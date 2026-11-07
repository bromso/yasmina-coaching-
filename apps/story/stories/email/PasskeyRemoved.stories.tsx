import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const accountUrl = "https://account.brand.com"

const meta = {
  title: "Email/PasskeyRemoved",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: {
    render: () =>
      emails.passkeyRemoved({ name: "Ada Lovelace", passkeyName: "Security key", accountUrl }),
  },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "A passkey was removed from your account"
      )
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(`${accountUrl}/security`)
  },
}

export const Swedish: Story = {
  args: {
    render: () =>
      emails.passkeyRemoved(
        { name: "Ada Lovelace", passkeyName: "Security key", accountUrl },
        "sv"
      ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "En passkey togs bort från ditt konto"
      )
    )
  },
}
