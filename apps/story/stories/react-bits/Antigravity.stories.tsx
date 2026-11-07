import Antigravity from "@repo/ui/components/Antigravity"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/Antigravity",
  component: Antigravity,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    count: { control: { type: "number", min: 50, max: 1000, step: 50 } },
    magnetRadius: { control: { type: "number", min: 1, max: 30, step: 1 } },
    ringRadius: { control: { type: "number", min: 1, max: 30, step: 1 } },
    waveSpeed: { control: { type: "number", min: 0.1, max: 2, step: 0.1 } },
    waveAmplitude: { control: { type: "number", min: 0, max: 5, step: 0.1 } },
    particleSize: { control: { type: "number", min: 0.5, max: 10, step: 0.5 } },
    lerpSpeed: { control: { type: "number", min: 0.01, max: 0.5, step: 0.01 } },
    color: { control: "color" },
    autoAnimate: { control: "boolean" },
    particleVariance: { control: { type: "number", min: 0, max: 3, step: 0.1 } },
    rotationSpeed: { control: { type: "number", min: 0, max: 2, step: 0.1 } },
    depthFactor: { control: { type: "number", min: 0, max: 3, step: 0.1 } },
    pulseSpeed: { control: { type: "number", min: 0, max: 10, step: 0.5 } },
    particleShape: {
      control: "select",
      options: ["capsule", "sphere", "box", "tetrahedron"],
    },
    fieldStrength: { control: { type: "number", min: 0, max: 30, step: 1 } },
  },
  args: {
    count: 300,
    magnetRadius: 10,
    ringRadius: 10,
    waveSpeed: 0.4,
    waveAmplitude: 1,
    particleSize: 2,
    lerpSpeed: 0.1,
    color: "#FF9FFC",
    autoAnimate: false,
    particleVariance: 1,
    rotationSpeed: 0,
    depthFactor: 1,
    pulseSpeed: 3,
    particleShape: "capsule",
    fieldStrength: 10,
  },
} satisfies Meta<typeof Antigravity>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
      <Antigravity {...args} />
    </div>
  ),
}

export const AutoAnimatedSpheres: Story = {
  args: {
    autoAnimate: true,
    particleShape: "sphere",
    color: "#67CFFF",
    count: 500,
    rotationSpeed: 0.3,
  },
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
      <Antigravity {...args} />
    </div>
  ),
}
