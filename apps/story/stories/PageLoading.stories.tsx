import { PageLoading } from "@repo/ui/blocks/page-loading"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { expect, within } from "storybook/test"

const meta = {
  title: "Blocks/PageLoading",
  component: PageLoading,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof PageLoading>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Loading…")
  },
}

export const CustomLabel: Story = {
  args: { label: "Fetching notes…" },
}
