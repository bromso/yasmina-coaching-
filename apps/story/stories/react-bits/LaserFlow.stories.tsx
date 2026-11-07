import LaserFlow from "@repo/ui/components/LaserFlow"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/LaserFlow",
  component: LaserFlow,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    wispDensity: { control: { type: "number", min: 0, max: 2, step: 0.1 } },
    mouseTiltStrength: { control: { type: "number", min: 0, max: 0.1, step: 0.005 } },
    horizontalBeamOffset: { control: { type: "number", min: -0.5, max: 0.5, step: 0.05 } },
    verticalBeamOffset: { control: { type: "number", min: -0.5, max: 0.5, step: 0.05 } },
    flowSpeed: { control: { type: "number", min: 0, max: 1, step: 0.05 } },
    verticalSizing: { control: { type: "number", min: 0.5, max: 5, step: 0.1 } },
    horizontalSizing: { control: { type: "number", min: 0.1, max: 2, step: 0.1 } },
    fogIntensity: { control: { type: "number", min: 0, max: 1, step: 0.05 } },
    fogScale: { control: { type: "number", min: 0.1, max: 1, step: 0.05 } },
    wispSpeed: { control: { type: "number", min: 1, max: 30, step: 1 } },
    wispIntensity: { control: { type: "number", min: 0, max: 10, step: 0.5 } },
    flowStrength: { control: { type: "number", min: 0, max: 1, step: 0.05 } },
    decay: { control: { type: "number", min: 0.5, max: 3, step: 0.1 } },
    falloffStart: { control: { type: "number", min: 0.5, max: 3, step: 0.1 } },
    fogFallSpeed: { control: { type: "number", min: 0, max: 2, step: 0.1 } },
    color: { control: "color" },
  },
  args: {
    wispDensity: 1,
    mouseTiltStrength: 0.01,
    horizontalBeamOffset: 0.1,
    verticalBeamOffset: 0.0,
    flowSpeed: 0.35,
    verticalSizing: 2.0,
    horizontalSizing: 0.5,
    fogIntensity: 0.45,
    fogScale: 0.3,
    wispSpeed: 15.0,
    wispIntensity: 5.0,
    flowStrength: 0.25,
    decay: 1.1,
    falloffStart: 1.2,
    fogFallSpeed: 0.6,
    color: "#FF79C6",
  },
} satisfies Meta<typeof LaserFlow>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh" }}>
      <LaserFlow {...args} />
    </div>
  ),
}

export const BlueBeam: Story = {
  args: {
    color: "#4FC3F7",
    verticalSizing: 3.0,
    wispDensity: 1.5,
    fogIntensity: 0.6,
  },
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh" }}>
      <LaserFlow {...args} />
    </div>
  ),
}
