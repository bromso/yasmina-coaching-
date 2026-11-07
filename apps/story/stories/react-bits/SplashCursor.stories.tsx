import SplashCursor from "@repo/ui/components/SplashCursor"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/SplashCursor",
  component: SplashCursor,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    SIM_RESOLUTION: { control: { type: "number", min: 32, max: 256, step: 32 } },
    DYE_RESOLUTION: { control: { type: "number", min: 512, max: 2048, step: 128 } },
    DENSITY_DISSIPATION: { control: { type: "number", min: 0.5, max: 10, step: 0.5 } },
    VELOCITY_DISSIPATION: { control: { type: "number", min: 0.5, max: 5, step: 0.5 } },
    PRESSURE: { control: { type: "number", min: 0, max: 1, step: 0.05 } },
    CURL: { control: { type: "number", min: 0, max: 30, step: 1 } },
    SPLAT_RADIUS: { control: { type: "number", min: 0.05, max: 1, step: 0.05 } },
    SPLAT_FORCE: { control: { type: "number", min: 1000, max: 20000, step: 500 } },
    SHADING: { control: "boolean" },
    COLOR_UPDATE_SPEED: { control: { type: "number", min: 1, max: 30, step: 1 } },
    TRANSPARENT: { control: "boolean" },
  },
  args: {
    SIM_RESOLUTION: 128,
    DYE_RESOLUTION: 1440,
    DENSITY_DISSIPATION: 3.5,
    VELOCITY_DISSIPATION: 2,
    PRESSURE: 0.1,
    CURL: 3,
    SPLAT_RADIUS: 0.2,
    SPLAT_FORCE: 6000,
    SHADING: true,
    COLOR_UPDATE_SPEED: 10,
    TRANSPARENT: true,
  },
} satisfies Meta<typeof SplashCursor>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a", position: "relative" }}>
      <SplashCursor {...args} />
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

export const HighCurl: Story = {
  args: {
    CURL: 20,
    SPLAT_FORCE: 10000,
    SPLAT_RADIUS: 0.4,
    DENSITY_DISSIPATION: 1.5,
  },
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a", position: "relative" }}>
      <SplashCursor {...args} />
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
