import PixelTrail from "@repo/ui/components/PixelTrail"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/PixelTrail",
  component: PixelTrail,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    gridSize: { control: { type: "number", min: 10, max: 100, step: 5 } },
    trailSize: { control: { type: "number", min: 0.01, max: 0.5, step: 0.01 } },
    maxAge: { control: { type: "number", min: 50, max: 1000, step: 50 } },
    interpolate: { control: { type: "number", min: 1, max: 20, step: 1 } },
    color: { control: "color" },
  },
  args: {
    gridSize: 40,
    trailSize: 0.1,
    maxAge: 250,
    interpolate: 5,
    color: "#ffffff",
  },
} satisfies Meta<typeof PixelTrail>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a", position: "relative" }}>
      <PixelTrail {...args} />
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

export const LargeGooey: Story = {
  args: {
    gridSize: 20,
    trailSize: 0.2,
    maxAge: 400,
    color: "#FF79C6",
    gooeyFilter: { id: "goo", strength: 12 },
  },
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a", position: "relative" }}>
      <PixelTrail {...args} />
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
