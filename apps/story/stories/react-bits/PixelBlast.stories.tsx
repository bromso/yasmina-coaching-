import PixelBlast from "@repo/ui/components/PixelBlast"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/PixelBlast",
  component: PixelBlast,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    variant: { control: "select", options: ["square", "circle", "triangle", "diamond"] },
    pixelSize: { control: { type: "range", min: 1, max: 10, step: 1 } },
    color: { control: "color" },
    antialias: { control: "boolean" },
    patternScale: { control: { type: "range", min: 0.5, max: 5, step: 0.5 } },
    patternDensity: { control: { type: "range", min: 0.1, max: 2, step: 0.1 } },
    liquid: { control: "boolean" },
    liquidStrength: { control: { type: "range", min: 0, max: 0.5, step: 0.01 } },
    enableRipples: { control: "boolean" },
    rippleSpeed: { control: { type: "range", min: 0.1, max: 1, step: 0.05 } },
    speed: { control: { type: "range", min: 0.1, max: 2, step: 0.1 } },
    transparent: { control: "boolean" },
    edgeFade: { control: { type: "range", min: 0, max: 1, step: 0.1 } },
  },
  args: {
    variant: "square",
    pixelSize: 3,
    color: "#B19EEF",
    antialias: true,
    patternScale: 2,
    patternDensity: 1,
    liquid: false,
    liquidStrength: 0.1,
    enableRipples: true,
    rippleSpeed: 0.3,
    speed: 0.5,
    transparent: true,
    edgeFade: 0.5,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PixelBlast>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const CircleLiquid: Story = {
  args: {
    variant: "circle",
    color: "#4ecdc4",
    liquid: true,
    liquidStrength: 0.15,
    patternDensity: 1.2,
  },
}
