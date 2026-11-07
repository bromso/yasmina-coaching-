import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const props = {
  name: "Ada Lovelace",
  workspaceName: "Acme Ops",
  link: "https://account.example.com/security",
}

const meta = {
  title: "Email/WorkspaceTwoFactorRequired",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: {
    render: () => emails.workspaceTwoFactorRequired(props),
  },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "Two-step verification is now required"
      )
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent("Acme Ops now requires every member")
    await expect(canvas.getByTestId("text")).toHaveTextContent(props.link)
  },
}

export const Swedish: Story = {
  args: {
    render: () => emails.workspaceTwoFactorRequired(props, "sv"),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Tvåstegsverifiering krävs nu")
    )
  },
}
