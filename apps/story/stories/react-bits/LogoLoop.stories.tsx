import LogoLoop from "@repo/ui/components/LogoLoop"
import type { Meta, StoryObj } from "@storybook/react-vite"

const sampleLogos = [
  { src: "https://picsum.photos/seed/logo1/120/40", alt: "Logo 1" },
  { src: "https://picsum.photos/seed/logo2/120/40", alt: "Logo 2" },
  { src: "https://picsum.photos/seed/logo3/120/40", alt: "Logo 3" },
  { src: "https://picsum.photos/seed/logo4/120/40", alt: "Logo 4" },
  { src: "https://picsum.photos/seed/logo5/120/40", alt: "Logo 5" },
  { src: "https://picsum.photos/seed/logo6/120/40", alt: "Logo 6" },
]

const meta = {
  title: "React Bits/Animations/LogoLoop",
  component: LogoLoop,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    speed: {
      control: { type: "range", min: 20, max: 400, step: 10 },
      description: "Scroll speed in pixels per second",
    },
    direction: {
      control: { type: "select" },
      options: ["left", "right", "up", "down"],
      description: "Direction of the scroll animation",
    },
    logoHeight: {
      control: { type: "range", min: 16, max: 64, step: 4 },
      description: "Height of each logo in pixels",
    },
    gap: {
      control: { type: "range", min: 8, max: 80, step: 4 },
      description: "Gap between logos in pixels",
    },
    pauseOnHover: {
      control: { type: "boolean" },
      description: "Pause the animation on hover",
    },
    fadeOut: {
      control: { type: "boolean" },
      description: "Add fade-out edges",
    },
    scaleOnHover: {
      control: { type: "boolean" },
      description: "Scale up logos on hover",
    },
  },
  args: {
    logos: sampleLogos,
    speed: 120,
    direction: "left",
    logoHeight: 28,
    gap: 32,
    pauseOnHover: false,
    fadeOut: false,
    scaleOnHover: false,
    width: 600,
  },
} satisfies Meta<typeof LogoLoop>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithFadeAndPause: Story = {
  args: {
    fadeOut: true,
    pauseOnHover: true,
    scaleOnHover: true,
    speed: 80,
    logoHeight: 36,
    gap: 48,
  },
}
