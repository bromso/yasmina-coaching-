import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const link = "https://app.brand.com/invitations/example"
const props = { workspaceName: "Acme Ops", inviterName: "Ada Lovelace", role: "member", link }

const meta = {
  title: "Email/Invitation",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.invitation(props) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("You're invited to Acme Ops")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(link)
    await expect(canvas.getByTestId("text")).toHaveTextContent("7 days")
  },
}

export const CustomBrand: Story = {
  args: { render: () => emails.invitation({ ...props, brand: "Acme" }) },
}

export const Swedish: Story = {
  args: { render: () => emails.invitation(props, "sv") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Du är inbjuden till Acme Ops")
    )
  },
}
