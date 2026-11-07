import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const siteUrl = "https://www.brand.com"

const meta = {
  title: "Email/WaitlistWelcome",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.waitlistWelcome({ siteUrl }) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("You're on the list")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(siteUrl)
    await expect(canvas.getByTestId("text")).toHaveTextContent("we'll email you")
  },
}

export const CustomBrand: Story = {
  args: { render: () => emails.waitlistWelcome({ siteUrl, brand: "Acme" }) },
}

export const Swedish: Story = {
  args: { render: () => emails.waitlistWelcome({ siteUrl }, "sv") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Du står på listan")
    )
  },
}
