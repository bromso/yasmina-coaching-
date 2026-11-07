import Crosshair from "@repo/ui/components/Crosshair"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/Crosshair",
  component: Crosshair,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    color: { control: "color" },
  },
  args: {
    color: "white",
  },
} satisfies Meta<typeof Crosshair>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a", position: "relative" }}>
      <Crosshair {...args} />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          color: "rgba(255,255,255,0.3)",
          fontSize: "1.25rem",
          fontFamily: "system-ui, sans-serif",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        Move your mouse around
      </div>
    </div>
  ),
}

export const Colored: Story = {
  args: {
    color: "#FF9FFC",
  },
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a", position: "relative" }}>
      <Crosshair {...args} />
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          color: "rgba(255,255,255,0.3)",
          fontSize: "1.25rem",
          fontFamily: "system-ui, sans-serif",
          pointerEvents: "none",
          userSelect: "none",
        }}
      >
        Move your mouse around
      </div>
    </div>
  ),
}
