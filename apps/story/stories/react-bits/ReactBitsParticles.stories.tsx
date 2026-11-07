import Particles from "@repo/ui/components/ReactBitsParticles"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/Particles",
  component: Particles,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    particleCount: { control: { type: "range", min: 50, max: 1000, step: 50 } },
    particleSpread: { control: { type: "range", min: 1, max: 30, step: 1 } },
    speed: { control: { type: "range", min: 0.01, max: 1, step: 0.01 } },
    particleColors: { control: "object" },
    moveParticlesOnHover: { control: "boolean" },
    particleHoverFactor: { control: { type: "range", min: 0.5, max: 5, step: 0.5 } },
    alphaParticles: { control: "boolean" },
    particleBaseSize: { control: { type: "range", min: 10, max: 500, step: 10 } },
    sizeRandomness: { control: { type: "range", min: 0, max: 3, step: 0.1 } },
    cameraDistance: { control: { type: "range", min: 5, max: 50, step: 1 } },
    disableRotation: { control: "boolean" },
  },
  args: {
    particleCount: 200,
    particleSpread: 10,
    speed: 0.1,
    particleColors: ["#ffffff", "#ffffff", "#ffffff"],
    moveParticlesOnHover: false,
    particleHoverFactor: 1,
    alphaParticles: false,
    particleBaseSize: 100,
    sizeRandomness: 1,
    cameraDistance: 20,
    disableRotation: false,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Particles>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ColorfulAlpha: Story = {
  args: {
    particleColors: ["#ff6b6b", "#4ecdc4", "#45b7d1", "#f9ca24"],
    alphaParticles: true,
    particleCount: 400,
    moveParticlesOnHover: true,
    speed: 0.2,
  },
}
