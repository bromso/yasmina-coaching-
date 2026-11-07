import LiquidEther from "@repo/ui/components/LiquidEther"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/LiquidEther",
  component: LiquidEther,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    mouseForce: { control: { type: "range", min: 1, max: 100, step: 1 } },
    cursorSize: { control: { type: "range", min: 10, max: 500, step: 10 } },
    isViscous: { control: "boolean" },
    viscous: { control: { type: "range", min: 1, max: 100, step: 1 } },
    resolution: { control: { type: "range", min: 0.1, max: 1, step: 0.1 } },
    isBounce: { control: "boolean" },
    BFECC: { control: "boolean" },
    colors: { control: "object" },
    autoDemo: { control: "boolean" },
    autoSpeed: { control: { type: "range", min: 0.1, max: 3, step: 0.1 } },
    autoIntensity: { control: { type: "range", min: 0.5, max: 5, step: 0.1 } },
  },
  args: {
    mouseForce: 20,
    cursorSize: 100,
    isViscous: false,
    viscous: 30,
    resolution: 0.5,
    isBounce: false,
    BFECC: true,
    colors: ["#5227FF", "#FF9FFC", "#B19EEF"],
    autoDemo: true,
    autoSpeed: 0.5,
    autoIntensity: 2.2,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", position: "relative", background: "#000" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LiquidEther>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WarmPalette: Story = {
  args: {
    colors: ["#FF4500", "#FF8C00", "#FFD700"],
    mouseForce: 40,
    autoSpeed: 1.0,
  },
}
