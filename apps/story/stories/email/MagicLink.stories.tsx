import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const link = "https://auth.brand.com/magic?token=example"

const meta = {
  title: "Email/MagicLink",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: { render: () => emails.magicLink({ link }) },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Your sign-in link")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(link)
    await expect(canvas.getByTestId("text")).toHaveTextContent("15 minutes")
  },
}

export const CustomBrand: Story = {
  args: { render: () => emails.magicLink({ link, brand: "Acme" }) },
}

export const Swedish: Story = {
  args: { render: () => emails.magicLink({ link }, "sv") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Din inloggningslänk")
    )
  },
}
