import { DashedLine } from "@repo/ui/components/dashed-line"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "Components/Coaching/DashedLine",
  component: DashedLine,
  tags: ["autodocs"],
  argTypes: {
    orientation: { control: "inline-radio", options: ["horizontal", "vertical"] },
  },
} satisfies Meta<typeof DashedLine>

export default meta
type Story = StoryObj<typeof meta>

export const Horizontal: Story = {
  render: (args) => (
    <div className="w-96">
      <DashedLine {...args} />
    </div>
  ),
}

export const Vertical: Story = {
  args: { orientation: "vertical" },
  render: (args) => (
    <div className="h-48">
      <DashedLine {...args} />
    </div>
  ),
}
