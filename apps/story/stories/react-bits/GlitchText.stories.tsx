import GlitchText from "@repo/ui/components/GlitchText"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/TextAnimations/GlitchText",
  component: GlitchText,
  parameters: {
    layout: "centered",
    backgrounds: { default: "dark" },
  },
  tags: ["autodocs"],
  argTypes: {
    children: {
      control: { type: "text" },
      description: "The text content to display with glitch effect",
    },
    speed: {
      control: { type: "range", min: 0.1, max: 2, step: 0.1 },
      description: "Speed multiplier for the glitch animation",
    },
    enableShadows: {
      control: { type: "boolean" },
      description: "Enable red/cyan text shadows on the glitch layers",
    },
    enableOnHover: {
      control: { type: "boolean" },
      description: "Only show glitch effect on hover instead of always",
    },
    className: {
      control: { type: "text" },
      description: "Additional CSS classes",
    },
  },
  args: {
    children: "Glitch",
    speed: 0.5,
    enableShadows: true,
    enableOnHover: false,
  },
  decorators: [
    (Story) => (
      <div style={{ background: "#060010", padding: "4rem" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GlitchText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const HoverOnly: Story = {
  args: {
    children: "Hover Me",
    enableOnHover: true,
  },
}

export const FastGlitch: Story = {
  args: {
    children: "Error 404",
    speed: 0.2,
    enableShadows: true,
  },
}
