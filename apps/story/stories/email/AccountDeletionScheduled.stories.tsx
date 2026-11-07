import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const date = "2026-11-01T00:00:00.000Z"
const link = "https://auth.brand.com/login"

const meta = {
  title: "Email/AccountDeletionScheduled",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: {
    render: () => emails.accountDeletionScheduled({ name: "Ada Lovelace", date, link }),
  },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Your account will be deleted")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(link)
    await expect(canvas.getByTestId("text")).toHaveTextContent("Nov 1, 2026")
  },
}

export const Swedish: Story = {
  args: {
    render: () => emails.accountDeletionScheduled({ name: "Ada Lovelace", date, link }, "sv"),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Ditt konto kommer att raderas")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("1 nov. 2026")
  },
}
