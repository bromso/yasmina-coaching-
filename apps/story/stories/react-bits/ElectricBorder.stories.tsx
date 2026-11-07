import ElectricBorder from "@repo/ui/components/ElectricBorder"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/ElectricBorder",
  component: ElectricBorder,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    color: {
      control: { type: "color" },
      description: "Color of the electric border effect",
    },
    speed: {
      control: { type: "range", min: 0.1, max: 5, step: 0.1 },
      description: "Speed of the electric animation",
    },
    chaos: {
      control: { type: "range", min: 0, max: 0.5, step: 0.01 },
      description: "Amount of noise displacement (higher = more chaotic)",
    },
    borderRadius: {
      control: { type: "range", min: 0, max: 50, step: 2 },
      description: "Border radius of the container in pixels",
    },
  },
  args: {
    color: "#5227FF",
    speed: 1,
    chaos: 0.12,
    borderRadius: 24,
  },
} satisfies Meta<typeof ElectricBorder>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: (
      <div
        style={{
          padding: "32px 48px",
          color: "white",
          textAlign: "center",
          background: "#0a0a0a",
          borderRadius: "inherit",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 20 }}>Electric Border</h3>
        <p style={{ margin: "8px 0 0", opacity: 0.7, fontSize: 14 }}>Hover for effect</p>
      </div>
    ),
  },
}

export const RedChaotic: Story = {
  args: {
    color: "#ff3366",
    chaos: 0.3,
    speed: 2,
    borderRadius: 16,
    children: (
      <div
        style={{
          padding: "32px 48px",
          color: "white",
          textAlign: "center",
          background: "#0a0a0a",
          borderRadius: "inherit",
        }}
      >
        <h3 style={{ margin: 0, fontSize: 20 }}>High Chaos</h3>
        <p style={{ margin: "8px 0 0", opacity: 0.7, fontSize: 14 }}>Fast and wild</p>
      </div>
    ),
  },
}
