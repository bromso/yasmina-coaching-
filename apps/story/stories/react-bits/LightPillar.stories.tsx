import LightPillar from "@repo/ui/components/LightPillar"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/LightPillar",
  component: LightPillar,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    topColor: { control: "color" },
    bottomColor: { control: "color" },
    intensity: { control: { type: "range", min: 0, max: 3, step: 0.1 } },
    rotationSpeed: { control: { type: "range", min: 0, max: 2, step: 0.1 } },
    interactive: { control: "boolean" },
    glowAmount: { control: { type: "range", min: 0.001, max: 0.02, step: 0.001 } },
    pillarWidth: { control: { type: "range", min: 0.5, max: 10, step: 0.5 } },
    pillarHeight: { control: { type: "range", min: 0.1, max: 2, step: 0.1 } },
    noiseIntensity: { control: { type: "range", min: 0, max: 2, step: 0.1 } },
    mixBlendMode: {
      control: "select",
      options: ["normal", "screen", "multiply", "overlay", "lighten", "darken"],
    },
    pillarRotation: { control: { type: "range", min: -180, max: 180, step: 1 } },
    quality: { control: "select", options: ["low", "medium", "high"] },
  },
  args: {
    topColor: "#5227FF",
    bottomColor: "#FF9FFC",
    intensity: 1.0,
    rotationSpeed: 0.3,
    interactive: false,
    glowAmount: 0.005,
    pillarWidth: 3.0,
    pillarHeight: 0.4,
    noiseIntensity: 0.5,
    mixBlendMode: "screen",
    pillarRotation: 0,
    quality: "high",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", position: "relative", background: "#000" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LightPillar>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WarmTones: Story = {
  args: {
    topColor: "#FF6B00",
    bottomColor: "#FFD700",
    pillarWidth: 4.0,
    intensity: 1.2,
  },
}
