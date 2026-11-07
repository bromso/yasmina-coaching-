import Galaxy from "@repo/ui/components/Galaxy"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/Galaxy",
  component: Galaxy,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    density: {
      control: { type: "range", min: 0.1, max: 5, step: 0.1 },
      description: "Star density",
    },
    speed: {
      control: { type: "range", min: 0, max: 5, step: 0.1 },
      description: "Overall speed multiplier",
    },
    starSpeed: {
      control: { type: "range", min: 0, max: 2, step: 0.1 },
      description: "Star layer movement speed",
    },
    hueShift: {
      control: { type: "range", min: 0, max: 360, step: 5 },
      description: "Hue rotation in degrees",
    },
    glowIntensity: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      description: "Star glow intensity",
    },
    twinkleIntensity: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      description: "Star twinkle intensity",
    },
    rotationSpeed: {
      control: { type: "range", min: 0, max: 1, step: 0.01 },
      description: "Auto-rotation speed",
    },
    mouseInteraction: { control: "boolean", description: "Enable mouse interaction" },
    mouseRepulsion: { control: "boolean", description: "Stars repel from mouse" },
    repulsionStrength: {
      control: { type: "range", min: 0, max: 10, step: 0.5 },
      description: "Mouse repulsion strength",
    },
    transparent: { control: "boolean", description: "Transparent background" },
    disableAnimation: { control: "boolean", description: "Freeze the animation" },
  },
  args: {
    density: 1,
    speed: 1.0,
    starSpeed: 0.5,
    hueShift: 140,
    glowIntensity: 0.3,
    twinkleIntensity: 0.3,
    rotationSpeed: 0.1,
    mouseInteraction: true,
    mouseRepulsion: true,
    repulsionStrength: 2,
    transparent: true,
    disableAnimation: false,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Galaxy>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const DenseColorful: Story = {
  args: {
    density: 3,
    hueShift: 0,
    glowIntensity: 0.6,
    twinkleIntensity: 0.8,
    saturation: 1.0,
    rotationSpeed: 0.05,
  },
}
