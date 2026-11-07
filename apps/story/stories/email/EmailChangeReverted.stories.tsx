import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const meta = {
  title: "Email/EmailChangeReverted",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: {
    render: () =>
      emails.emailChangeReverted({ name: "Ada Lovelace", hasPassword: true, passkeysRemoved: 1 }),
  },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Your email change was undone")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(
      "A separate email has a link to set a new password."
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(
      "Review your connected sign-in providers and two-step verification"
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(
      "If you still can't get in, contact support."
    )
  },
}

/** Everything an attacker could have added since the change, rolled back. */
export const RolledBack: Story = {
  args: {
    render: () =>
      emails.emailChangeReverted({
        name: "Ada Lovelace",
        hasPassword: true,
        passkeysRemoved: 2,
        identitiesRemoved: 1,
        twoFactorDisabled: true,
        deletionCancelled: true,
      }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("text")).toHaveTextContent("2 passkeys were removed.")
    )
    const text = canvas.getByTestId("text")
    await expect(text).toHaveTextContent(
      "1 sign-in provider connected since the change was disconnected."
    )
    await expect(text).toHaveTextContent(
      "Two-step verification, turned on since the change, was turned off."
    )
    await expect(text).toHaveTextContent(
      "The account deletion requested since the change was cancelled."
    )
  },
}

/** A passwordless account (magic link or a provider only): no mention of a password. */
export const Passwordless: Story = {
  args: { render: () => emails.emailChangeReverted({ name: "Ada Lovelace" }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Your email change was undone")
    )
    await expect(canvas.getByTestId("text")).not.toHaveTextContent("password")
  },
}

export const Swedish: Story = {
  args: {
    render: () =>
      emails.emailChangeReverted(
        { name: "Ada Lovelace", hasPassword: true, passkeysRemoved: 1, identitiesRemoved: 1 },
        "sv"
      ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Din e-postadressändring har ångrats")
    )
  },
}
