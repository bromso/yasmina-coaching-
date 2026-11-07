import { StatCardLine } from "@repo/ui/components/charts"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Bklit/Blocks/StatCardLine",
  component: StatCardLine,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof StatCardLine>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <div className="w-[720px] max-w-md">
      <StatCardLine />
    </div>
  ),
}
