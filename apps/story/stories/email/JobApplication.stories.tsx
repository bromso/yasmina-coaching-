import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const adminUrl = "https://auth.brand.com/admin/applications/app_123"
const props = {
  reference: "app_123",
  title: "Senior Engineer",
  name: "Ada Lovelace",
  email: "ada@example.com",
  link: "https://github.com/ada",
  note: "I'd love to work on this.\n\nHere's my portfolio too.",
  adminUrl,
}

const meta = {
  title: "Email/JobApplication",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.jobApplication(props) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent(
        "New application app_123: Senior Engineer"
      )
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(adminUrl)
    await expect(canvas.getByTestId("text")).toHaveTextContent("I'd love to work on this.")
  },
}

export const WithoutLinkOrNote: Story = {
  args: { render: () => emails.jobApplication({ ...props, link: undefined, note: undefined }) },
}

export const Swedish: Story = {
  args: { render: () => emails.jobApplication(props, "sv") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Ny ansökan app_123: Senior Engineer")
    )
  },
}
