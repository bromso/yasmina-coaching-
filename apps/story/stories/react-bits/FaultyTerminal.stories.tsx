import FaultyTerminal from "@repo/ui/components/FaultyTerminal"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/FaultyTerminal",
  component: FaultyTerminal,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs", "!test"],
  argTypes: {
    scale: {
      control: { type: "range", min: 0.5, max: 3, step: 0.1 },
      description: "Overall scale of the terminal grid",
    },
    digitSize: {
      control: { type: "range", min: 0.5, max: 3, step: 0.1 },
      description: "Size of each digit cell",
    },
    scanlineIntensity: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      description: "Scanline bar intensity",
    },
    glitchAmount: {
      control: { type: "range", min: 0, max: 5, step: 0.1 },
      description: "Horizontal glitch displacement",
    },
    flickerAmount: {
      control: { type: "range", min: 0, max: 3, step: 0.1 },
      description: "Flicker intensity",
    },
    noiseAmp: {
      control: { type: "range", min: 0, max: 3, step: 0.1 },
      description: "Noise amplitude",
    },
    curvature: {
      control: { type: "range", min: 0, max: 0.5, step: 0.01 },
      description: "CRT barrel distortion curvature",
    },
    tint: { control: { type: "color" }, description: "Color tint for the terminal" },
    mouseReact: { control: "boolean", description: "Enable mouse reactivity" },
    mouseStrength: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      description: "Mouse effect strength",
    },
    brightness: {
      control: { type: "range", min: 0.1, max: 3, step: 0.1 },
      description: "Overall brightness",
    },
    pause: { control: "boolean", description: "Pause the animation" },
    pageLoadAnimation: { control: "boolean", description: "Enable page load fade-in" },
  },
  args: {
    scale: 1,
    digitSize: 1.5,
    scanlineIntensity: 0.3,
    glitchAmount: 1,
    flickerAmount: 1,
    noiseAmp: 1,
    curvature: 0.2,
    tint: "#ffffff",
    mouseReact: true,
    mouseStrength: 0.2,
    brightness: 1,
    pause: false,
    pageLoadAnimation: true,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FaultyTerminal>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const GreenTerminal: Story = {
  args: {
    tint: "#00ff41",
    curvature: 0.3,
    scanlineIntensity: 0.5,
    brightness: 0.8,
  },
}
