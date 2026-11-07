import FluidGlass from "@repo/ui/components/FluidGlass"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Components/FluidGlass",
  component: FluidGlass,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs", "!test"],
  argTypes: {
    mode: {
      control: { type: "select" },
      options: ["lens", "bar", "cube"],
      description:
        "Glass shape mode: lens follows cursor, bar sticks to bottom, cube follows cursor",
    },
  },
  args: {
    mode: "lens",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "800px", height: "600px", background: "#060010" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FluidGlass>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const CubeMode: Story = {
  args: {
    mode: "cube",
  },
}
