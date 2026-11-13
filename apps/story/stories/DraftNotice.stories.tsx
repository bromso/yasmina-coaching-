import { DraftNotice } from "@repo/ui/components/draft-notice"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Components/DraftNotice",
  component: DraftNotice,
  tags: ["autodocs"],
  args: { children: "Utkast – granskas juridiskt" },
} satisfies Meta<typeof DraftNotice>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole("note")).toHaveTextContent("Utkast – granskas juridiskt")
  },
}

export const English: Story = {
  args: { children: "Draft – under legal review" },
}
