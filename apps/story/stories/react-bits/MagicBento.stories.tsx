import MagicBento from "@repo/ui/components/MagicBento"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Components/MagicBento",
  component: MagicBento,
  parameters: {
    layout: "centered",
    backgrounds: { default: "dark" },
  },
  tags: ["autodocs"],
  argTypes: {
    textAutoHide: {
      control: "boolean",
      description: "Auto-hide overflowing text with ellipsis",
    },
    enableStars: {
      control: "boolean",
      description: "Enable floating particle stars on hover",
    },
    enableSpotlight: {
      control: "boolean",
      description: "Enable cursor-following spotlight effect",
    },
    enableBorderGlow: {
      control: "boolean",
      description: "Enable glowing border effect on cards",
    },
    disableAnimations: {
      control: "boolean",
      description: "Disable all animations",
    },
    spotlightRadius: {
      control: { type: "range", min: 100, max: 600, step: 50 },
      description: "Radius of the spotlight effect",
    },
    particleCount: {
      control: { type: "range", min: 4, max: 30, step: 2 },
      description: "Number of particles per card",
    },
    enableTilt: {
      control: "boolean",
      description: "Enable 3D tilt on hover",
    },
    clickEffect: {
      control: "boolean",
      description: "Enable ripple effect on click",
    },
    enableMagnetism: {
      control: "boolean",
      description: "Enable magnetic pull toward cursor",
    },
    glowColor: {
      control: "text",
      description: "RGB glow color (e.g. '132, 0, 255')",
    },
  },
  args: {
    textAutoHide: true,
    enableStars: true,
    enableSpotlight: true,
    enableBorderGlow: true,
    disableAnimations: false,
    spotlightRadius: 300,
    particleCount: 12,
    enableTilt: false,
    clickEffect: true,
    enableMagnetism: true,
    glowColor: "132, 0, 255",
  },
  decorators: [
    (Story) => (
      <div style={{ background: "#060010", padding: "2rem" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MagicBento>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithTilt: Story = {
  args: {
    enableTilt: true,
    enableMagnetism: false,
  },
}
