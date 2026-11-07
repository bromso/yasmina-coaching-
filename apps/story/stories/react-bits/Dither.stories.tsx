import Dither from "@repo/ui/components/Dither"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/Dither",
  component: Dither,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    waveSpeed: {
      control: { type: "range", min: 0, max: 0.5, step: 0.01 },
      description: "Speed of the wave animation",
    },
    waveFrequency: {
      control: { type: "range", min: 1, max: 10, step: 0.5 },
      description: "Wave noise frequency",
    },
    waveAmplitude: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      description: "Wave amplitude",
    },
    waveColor: {
      control: { type: "object" },
      description: "Wave color as [r, g, b] normalized values",
    },
    colorNum: {
      control: { type: "range", min: 2, max: 16, step: 1 },
      description: "Number of dither color levels",
    },
    pixelSize: {
      control: { type: "range", min: 1, max: 10, step: 1 },
      description: "Dither pixel size",
    },
    disableAnimation: { control: "boolean", description: "Freeze the animation" },
    enableMouseInteraction: { control: "boolean", description: "Enable mouse interaction" },
    mouseRadius: {
      control: { type: "range", min: 0.1, max: 3, step: 0.1 },
      description: "Mouse effect radius",
    },
  },
  args: {
    waveSpeed: 0.05,
    waveFrequency: 3,
    waveAmplitude: 0.3,
    waveColor: [0.5, 0.5, 0.5] as [number, number, number],
    colorNum: 4,
    pixelSize: 2,
    disableAnimation: false,
    enableMouseInteraction: true,
    mouseRadius: 1,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Dither>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const BlueWaves: Story = {
  args: {
    waveColor: [0.2, 0.4, 0.8] as [number, number, number],
    waveFrequency: 5,
    colorNum: 6,
    pixelSize: 3,
  },
}
