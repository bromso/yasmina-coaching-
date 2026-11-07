import { LegalPage } from "@repo/ui/blocks/legal-page"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Blocks/LegalPage",
  component: LegalPage,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    title: "Terms of Service",
    updatedAt: "2026-10-02",
    notice: "This is a template — have counsel review it before publishing.",
    sections: [
      {
        id: "acceptance",
        title: "Acceptance of terms",
        paragraphs: [
          "By using this service you agree to these terms.",
          "If you do not agree, do not use the service.",
        ],
      },
      {
        id: "accounts",
        title: "Accounts",
        paragraphs: ["You are responsible for keeping your account credentials secure."],
      },
      {
        id: "contact",
        title: "Contact",
        paragraphs: ["Questions about these terms can be sent to legal@example.com."],
      },
    ],
  },
} satisfies Meta<typeof LegalPage>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("navigation", { name: "Contents" })).toBeInTheDocument()
  },
}
