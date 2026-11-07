import { StatCardArea } from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Bklit/Blocks/StatCardArea",
  component: StatCardArea,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof StatCardArea>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <div className="w-[720px] max-w-md">
      <StatCardArea />
    </div>
  ),
}
