import { DeletionBanner } from "@repo/ui/components/deletion-banner"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/DeletionBanner",
  component: DeletionBanner,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  args: {
    deletionScheduledAt: "2026-10-17T09:00:00.000Z",
    cancel: () => {},
  },
} satisfies Meta<typeof DeletionBanner>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "Your account will be deleted on Oct 17, 2026."
    )
    await expect(canvas.getByRole("button", { name: "Cancel deletion" })).toBeInTheDocument()
  },
}

export const Swedish: Story = {
  args: { text: "Ditt konto raderas den 17 okt. 2026.", labels: { cancel: "Avbryt raderingen" } },
}
