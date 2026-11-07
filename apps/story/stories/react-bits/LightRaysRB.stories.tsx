import LightRays from "@repo/ui/components/LightRays"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/LightRays",
  component: LightRays,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    raysOrigin: {
      control: "select",
      options: [
        "top-center",
        "top-left",
        "top-right",
        "right",
        "left",
        "bottom-center",
        "bottom-right",
        "bottom-left",
      ],
    },
    raysColor: { control: "color" },
    raysSpeed: { control: { type: "range", min: 0.1, max: 5, step: 0.1 } },
    lightSpread: { control: { type: "range", min: 0.1, max: 5, step: 0.1 } },
    rayLength: { control: { type: "range", min: 0.5, max: 5, step: 0.1 } },
    pulsating: { control: "boolean" },
    fadeDistance: { control: { type: "range", min: 0.1, max: 3, step: 0.1 } },
    saturation: { control: { type: "range", min: 0, max: 2, step: 0.1 } },
    followMouse: { control: "boolean" },
    mouseInfluence: { control: { type: "range", min: 0, max: 1, step: 0.05 } },
    noiseAmount: { control: { type: "range", min: 0, max: 1, step: 0.1 } },
    distortion: { control: { type: "range", min: 0, max: 2, step: 0.1 } },
  },
  args: {
    raysOrigin: "top-center",
    raysColor: "#ffffff",
    raysSpeed: 1,
    lightSpread: 1,
    rayLength: 2,
    pulsating: false,
    fadeDistance: 1.0,
    saturation: 1.0,
    followMouse: true,
    mouseInfluence: 0.1,
    noiseAmount: 0.0,
    distortion: 0.0,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", position: "relative", background: "#111" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LightRays>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const PulsatingFromLeft: Story = {
  args: {
    raysOrigin: "left",
    raysColor: "#ff8800",
    pulsating: true,
    lightSpread: 2,
    distortion: 0.5,
  },
}
