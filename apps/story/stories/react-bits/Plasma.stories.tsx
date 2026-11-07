import Plasma from "@repo/ui/components/Plasma"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/Plasma",
  component: Plasma,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    color: { control: "color" },
    speed: { control: { type: "range", min: 0.1, max: 5, step: 0.1 } },
    direction: { control: "select", options: ["forward", "reverse", "pingpong"] },
    scale: { control: { type: "range", min: 0.5, max: 3, step: 0.1 } },
    opacity: { control: { type: "range", min: 0, max: 1, step: 0.1 } },
    mouseInteractive: { control: "boolean" },
  },
  args: {
    color: "#ffffff",
    speed: 1,
    direction: "forward",
    scale: 1,
    opacity: 1,
    mouseInteractive: true,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Plasma>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const PingPongPurple: Story = {
  args: {
    color: "#9b59b6",
    direction: "pingpong",
    speed: 1.5,
    scale: 1.2,
  },
}
