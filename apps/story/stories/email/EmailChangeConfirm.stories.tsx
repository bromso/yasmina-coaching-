import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const link = "https://account.brand.com/email/confirm?token=example"

const meta = {
  title: "Email/EmailChangeConfirm",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.emailChangeConfirm({ name: "Ada Lovelace", link }) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Confirm your new email address")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(link)
  },
}

export const Swedish: Story = {
  args: { render: () => emails.emailChangeConfirm({ name: "Ada Lovelace", link }, "sv") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Bekräfta din nya e-postadress")
    )
  },
}
