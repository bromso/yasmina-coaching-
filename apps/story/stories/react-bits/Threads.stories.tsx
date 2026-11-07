import Threads from "@repo/ui/components/Threads"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/Threads",
  component: Threads,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    color: { control: "object" },
    amplitude: { control: { type: "range", min: 0, max: 3, step: 0.1 } },
    distance: { control: { type: "range", min: 0, max: 2, step: 0.1 } },
    enableMouseInteraction: { control: "boolean" },
  },
  args: {
    color: [1, 1, 1],
    amplitude: 1,
    distance: 0,
    enableMouseInteraction: false,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Threads>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const InteractiveBlue: Story = {
  args: {
    color: [0.3, 0.5, 1.0],
    amplitude: 1.5,
    distance: 0.5,
    enableMouseInteraction: true,
  },
}
