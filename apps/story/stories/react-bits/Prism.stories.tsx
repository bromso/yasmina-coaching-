import Prism from "@repo/ui/components/Prism"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/Prism",
  component: Prism,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    height: { control: { type: "range", min: 0.5, max: 10, step: 0.5 } },
    baseWidth: { control: { type: "range", min: 1, max: 15, step: 0.5 } },
    animationType: { control: "select", options: ["rotate", "hover", "3drotate"] },
    glow: { control: { type: "range", min: 0, max: 5, step: 0.1 } },
    noise: { control: { type: "range", min: 0, max: 2, step: 0.1 } },
    transparent: { control: "boolean" },
    scale: { control: { type: "range", min: 1, max: 10, step: 0.1 } },
    hueShift: { control: { type: "range", min: -3.14, max: 3.14, step: 0.1 } },
    colorFrequency: { control: { type: "range", min: 0.1, max: 5, step: 0.1 } },
    bloom: { control: { type: "range", min: 0, max: 5, step: 0.1 } },
    timeScale: { control: { type: "range", min: 0, max: 3, step: 0.1 } },
    hoverStrength: { control: { type: "range", min: 0, max: 5, step: 0.1 } },
    inertia: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
  },
  args: {
    height: 3.5,
    baseWidth: 5.5,
    animationType: "rotate",
    glow: 1,
    noise: 0.5,
    transparent: true,
    scale: 3.6,
    hueShift: 0,
    colorFrequency: 1,
    bloom: 1,
    timeScale: 0.5,
    hoverStrength: 2,
    inertia: 0.05,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", position: "relative", background: "#000" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Prism>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Rotating3D: Story = {
  args: {
    animationType: "3drotate",
    hueShift: 1.5,
    bloom: 2,
    glow: 1.5,
  },
}
