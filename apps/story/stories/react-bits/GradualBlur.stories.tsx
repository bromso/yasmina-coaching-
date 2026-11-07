import GradualBlur from "@repo/ui/components/GradualBlur"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/GradualBlur",
  component: GradualBlur,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    position: {
      control: { type: "select" },
      options: ["top", "bottom", "left", "right"],
      description: "Edge where the blur effect is applied",
    },
    strength: {
      control: { type: "range", min: 0.5, max: 6, step: 0.5 },
      description: "Blur strength multiplier",
    },
    height: {
      control: { type: "text" },
      description: "Height of the blur region (CSS value)",
    },
    divCount: {
      control: { type: "range", min: 2, max: 12, step: 1 },
      description: "Number of blur layers (more = smoother gradient)",
    },
    exponential: {
      control: { type: "boolean" },
      description: "Use exponential blur scaling instead of linear",
    },
    opacity: {
      control: { type: "range", min: 0, max: 1, step: 0.1 },
      description: "Overall opacity of the blur overlay",
    },
    curve: {
      control: { type: "select" },
      options: ["linear", "bezier", "ease-in", "ease-out", "ease-in-out"],
      description: "Blur distribution curve",
    },
    preset: {
      control: { type: "select" },
      options: [
        "top",
        "bottom",
        "left",
        "right",
        "subtle",
        "intense",
        "smooth",
        "sharp",
        "header",
        "footer",
        "sidebar",
      ],
      description: "Predefined configuration preset",
    },
  },
  args: {
    position: "bottom",
    strength: 2,
    height: "6rem",
    divCount: 5,
    exponential: false,
    opacity: 1,
    curve: "linear",
  },
  decorators: [
    (Story) => (
      <div
        style={{
          width: 400,
          height: 300,
          position: "relative",
          overflow: "hidden",
          borderRadius: 12,
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
          display: "grid",
          placeItems: "center",
          color: "white",
        }}
      >
        <p style={{ fontSize: 20, margin: 0, zIndex: 1 }}>Content behind blur</p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GradualBlur>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const IntensePreset: Story = {
  args: {
    preset: "intense",
  },
}
