import ClickSpark from "@repo/ui/components/ClickSpark"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/ClickSpark",
  component: ClickSpark,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    sparkColor: {
      control: { type: "color" },
      description: "Color of the spark lines",
    },
    sparkSize: {
      control: { type: "range", min: 2, max: 30, step: 1 },
      description: "Length of each spark line",
    },
    sparkRadius: {
      control: { type: "range", min: 5, max: 50, step: 1 },
      description: "Radius the sparks travel outward",
    },
    sparkCount: {
      control: { type: "range", min: 4, max: 20, step: 1 },
      description: "Number of spark lines per click",
    },
    duration: {
      control: { type: "range", min: 100, max: 1000, step: 50 },
      description: "Duration of the spark animation in milliseconds",
    },
    easing: {
      control: { type: "select" },
      options: ["linear", "ease-in", "ease-out", "ease-in-out"],
      description: "Easing function for the spark animation",
    },
    extraScale: {
      control: { type: "range", min: 0.5, max: 3, step: 0.1 },
      description: "Extra scale multiplier for spark distance",
    },
  },
  args: {
    sparkColor: "#fff",
    sparkSize: 10,
    sparkRadius: 15,
    sparkCount: 8,
    duration: 400,
    easing: "ease-out",
    extraScale: 1.0,
  },
} satisfies Meta<typeof ClickSpark>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  args: {
    children: (
      <div
        style={{
          width: 400,
          height: 300,
          display: "grid",
          placeItems: "center",
          background: "#1a1a2e",
          borderRadius: 12,
          color: "white",
          cursor: "pointer",
        }}
      >
        <p style={{ margin: 0, fontSize: 18 }}>Click anywhere for sparks</p>
      </div>
    ),
  },
}

export const ColorfulSparks: Story = {
  args: {
    sparkColor: "#ff6b6b",
    sparkSize: 16,
    sparkRadius: 25,
    sparkCount: 12,
    duration: 600,
    extraScale: 1.5,
    children: (
      <div
        style={{
          width: 400,
          height: 300,
          display: "grid",
          placeItems: "center",
          background: "#2d1b69",
          borderRadius: 12,
          color: "white",
          cursor: "pointer",
        }}
      >
        <p style={{ margin: 0, fontSize: 18 }}>Red sparks with larger radius</p>
      </div>
    ),
  },
}
