import Ribbons from "@repo/ui/components/Ribbons"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/Ribbons",
  component: Ribbons,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    colors: { control: "object" },
    baseSpring: { control: { type: "number", min: 0.01, max: 0.1, step: 0.005 } },
    baseFriction: { control: { type: "number", min: 0.8, max: 0.99, step: 0.01 } },
    baseThickness: { control: { type: "number", min: 5, max: 60, step: 5 } },
    offsetFactor: { control: { type: "number", min: 0, max: 0.2, step: 0.01 } },
    maxAge: { control: { type: "number", min: 100, max: 2000, step: 100 } },
    pointCount: { control: { type: "number", min: 10, max: 100, step: 10 } },
    speedMultiplier: { control: { type: "number", min: 0.1, max: 2, step: 0.1 } },
    enableFade: { control: "boolean" },
    enableShaderEffect: { control: "boolean" },
    effectAmplitude: { control: { type: "number", min: 0.5, max: 5, step: 0.5 } },
  },
  args: {
    colors: ["#ff9346", "#7cff67", "#ffee51", "#5227FF"],
    baseSpring: 0.03,
    baseFriction: 0.9,
    baseThickness: 30,
    offsetFactor: 0.05,
    maxAge: 500,
    pointCount: 50,
    speedMultiplier: 0.6,
    enableFade: false,
    enableShaderEffect: false,
    effectAmplitude: 2,
  },
} satisfies Meta<typeof Ribbons>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
      <Ribbons {...args} />
    </div>
  ),
}

export const FadingWithEffect: Story = {
  args: {
    enableFade: true,
    enableShaderEffect: true,
    colors: ["#FF79C6", "#BD93F9", "#8BE9FD", "#50FA7B"],
    baseThickness: 40,
  },
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
      <Ribbons {...args} />
    </div>
  ),
}
