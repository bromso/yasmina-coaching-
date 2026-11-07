import GhostCursor from "@repo/ui/components/GhostCursor"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/GhostCursor",
  component: GhostCursor,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs", "!test"],
  argTypes: {
    trailLength: { control: { type: "number", min: 5, max: 100, step: 5 } },
    inertia: { control: { type: "number", min: 0, max: 1, step: 0.05 } },
    grainIntensity: { control: { type: "number", min: 0, max: 0.5, step: 0.01 } },
    bloomStrength: { control: { type: "number", min: 0, max: 1, step: 0.05 } },
    bloomRadius: { control: { type: "number", min: 0, max: 3, step: 0.1 } },
    bloomThreshold: { control: { type: "number", min: 0, max: 0.5, step: 0.005 } },
    brightness: { control: { type: "number", min: 0.1, max: 3, step: 0.1 } },
    color: { control: "color" },
    edgeIntensity: { control: { type: "number", min: 0, max: 1, step: 0.1 } },
  },
  args: {
    trailLength: 50,
    inertia: 0.5,
    grainIntensity: 0.05,
    bloomStrength: 0.1,
    bloomRadius: 1.0,
    bloomThreshold: 0.025,
    brightness: 1,
    color: "#B19EEF",
    edgeIntensity: 0,
  },
} satisfies Meta<typeof GhostCursor>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a", position: "relative" }}>
      <GhostCursor {...args} />
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
          zIndex: 1,
        }}
      >
        Move your mouse around
      </div>
    </div>
  ),
}

export const BrightGreen: Story = {
  args: {
    color: "#67FF8A",
    brightness: 2,
    trailLength: 80,
    bloomStrength: 0.3,
  },
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a", position: "relative" }}>
      <GhostCursor {...args} />
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
          zIndex: 1,
        }}
      >
        Move your mouse around
      </div>
    </div>
  ),
}
