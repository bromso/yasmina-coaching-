import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const meta = {
  title: "Email/AccountSuspended",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: {
    render: () => emails.accountSuspended({ name: "Ada Lovelace", until: null }),
  },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Indefinite: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Your account has been suspended")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("will not be able to sign in")
    await expect(canvas.getByTestId("text")).toHaveTextContent("contact support")
  },
}

export const UntilDate: Story = {
  args: {
    render: () =>
      emails.accountSuspended({ name: "Ada Lovelace", until: "2026-11-01T00:00:00.000Z" }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByTestId("text")).toHaveTextContent("Nov 1, 2026"))
  },
}

export const Swedish: Story = {
  args: {
    render: () => emails.accountSuspended({ name: "Ada Lovelace", until: null }, "sv"),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Ditt konto har stängts av")
    )
  },
}
