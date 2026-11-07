import MetaBalls from "@repo/ui/components/MetaBalls"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/MetaBalls",
  component: MetaBalls,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    color: { control: "color" },
    cursorBallColor: { control: "color" },
    speed: { control: { type: "number", min: 0.05, max: 2, step: 0.05 } },
    enableMouseInteraction: { control: "boolean" },
    hoverSmoothness: { control: { type: "number", min: 0.01, max: 0.3, step: 0.01 } },
    animationSize: { control: { type: "number", min: 10, max: 60, step: 5 } },
    ballCount: { control: { type: "number", min: 3, max: 50, step: 1 } },
    clumpFactor: { control: { type: "number", min: 0.1, max: 3, step: 0.1 } },
    cursorBallSize: { control: { type: "number", min: 0.5, max: 10, step: 0.5 } },
    enableTransparency: { control: "boolean" },
  },
  args: {
    color: "#ffffff",
    cursorBallColor: "#ffffff",
    speed: 0.3,
    enableMouseInteraction: true,
    hoverSmoothness: 0.05,
    animationSize: 30,
    ballCount: 15,
    clumpFactor: 1,
    cursorBallSize: 3,
    enableTransparency: false,
  },
} satisfies Meta<typeof MetaBalls>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
      <MetaBalls {...args} />
    </div>
  ),
}

export const ColoredTransparent: Story = {
  args: {
    color: "#FF6B6B",
    cursorBallColor: "#4ECDC4",
    enableTransparency: true,
    ballCount: 25,
    speed: 0.5,
  },
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#111" }}>
      <MetaBalls {...args} />
    </div>
  ),
}
