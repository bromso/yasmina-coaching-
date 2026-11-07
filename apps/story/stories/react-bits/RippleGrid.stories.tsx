import RippleGrid from "@repo/ui/components/RippleGrid"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/RippleGrid",
  component: RippleGrid,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    enableRainbow: { control: "boolean" },
    gridColor: { control: "color" },
    rippleIntensity: { control: { type: "range", min: 0, max: 0.2, step: 0.005 } },
    gridSize: { control: { type: "range", min: 2, max: 30, step: 1 } },
    gridThickness: { control: { type: "range", min: 1, max: 40, step: 1 } },
    fadeDistance: { control: { type: "range", min: 0.5, max: 5, step: 0.1 } },
    vignetteStrength: { control: { type: "range", min: 0, max: 5, step: 0.1 } },
    glowIntensity: { control: { type: "range", min: 0, max: 1, step: 0.05 } },
    opacity: { control: { type: "range", min: 0, max: 1, step: 0.1 } },
    gridRotation: { control: { type: "range", min: -90, max: 90, step: 5 } },
    mouseInteraction: { control: "boolean" },
    mouseInteractionRadius: { control: { type: "range", min: 0.1, max: 3, step: 0.1 } },
  },
  args: {
    enableRainbow: false,
    gridColor: "#ffffff",
    rippleIntensity: 0.05,
    gridSize: 10,
    gridThickness: 15,
    fadeDistance: 1.5,
    vignetteStrength: 2.0,
    glowIntensity: 0.1,
    opacity: 1.0,
    gridRotation: 0,
    mouseInteraction: true,
    mouseInteractionRadius: 1,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RippleGrid>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const RainbowGrid: Story = {
  args: {
    enableRainbow: true,
    gridSize: 8,
    glowIntensity: 0.3,
    rippleIntensity: 0.08,
  },
}
