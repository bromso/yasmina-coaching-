import { emails } from "@repo/email"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, waitFor, within } from "storybook/test"
import { EmailPreview } from "./EmailPreview"

const link = "https://account.brand.com/privacy/exports/example.zip"

const meta = {
  title: "Email/DataExportReady",
  component: EmailPreview,
  parameters: { layout: "padded" },
  args: {
    render: () => emails.dataExportReady({ name: "Ada Lovelace", link }),
  },
} satisfies Meta<typeof EmailPreview>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Your data export is ready")
    )
    await expect(canvas.getByTestId("text")).toHaveTextContent(link)
    await expect(canvas.getByTestId("text")).toHaveTextContent("7 days")
  },
}

export const Swedish: Story = {
  args: { render: () => emails.dataExportReady({ name: "Ada Lovelace", link }, "sv") },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByTestId("subject")).toHaveTextContent("Din dataexport är klar")
    )
  },
}
