import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const accountUrl = "https://account.brand.com"

const meta = {
  title: "Email/PasskeysRemoved",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: {
    render: () => emails.passkeysRemoved({ name: "Ada Lovelace", accountUrl, hasPassword: true }),
  },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Your passkeys were removed")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(`${accountUrl}/security`)
    await expect(canvas.getByTestId("text")).toHaveTextContent("Your password was not changed.")
  },
}

/** A passwordless account (magic link or a provider only): nothing about a password. */
export const Passwordless: Story = {
  args: { render: () => emails.passkeysRemoved({ name: "Ada Lovelace", accountUrl }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Your passkeys were removed")
    )
    await expect(canvas.getByTestId("text")).not.toHaveTextContent("password")
  },
}

export const Swedish: Story = {
  args: {
    render: () =>
      emails.passkeysRemoved({ name: "Ada Lovelace", accountUrl, hasPassword: true }, "sv"),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Dina passkeys togs bort")
    )
  },
}
