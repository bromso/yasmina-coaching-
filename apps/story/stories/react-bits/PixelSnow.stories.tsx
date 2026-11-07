import PixelSnow from "@repo/ui/components/PixelSnow"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/PixelSnow",
  component: PixelSnow,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs", "!test"],
  argTypes: {
    color: { control: "color" },
    flakeSize: { control: { type: "range", min: 0.001, max: 0.05, step: 0.001 } },
    minFlakeSize: { control: { type: "range", min: 0.5, max: 5, step: 0.25 } },
    pixelResolution: { control: { type: "range", min: 50, max: 500, step: 25 } },
    speed: { control: { type: "range", min: 0.1, max: 5, step: 0.1 } },
    depthFade: { control: { type: "range", min: 1, max: 20, step: 1 } },
    farPlane: { control: { type: "range", min: 5, max: 50, step: 5 } },
    brightness: { control: { type: "range", min: 0.1, max: 3, step: 0.1 } },
    density: { control: { type: "range", min: 0.1, max: 1, step: 0.05 } },
    variant: { control: "select", options: ["square", "round", "snowflake"] },
    direction: { control: { type: "range", min: 0, max: 360, step: 5 } },
  },
  args: {
    color: "#ffffff",
    flakeSize: 0.01,
    minFlakeSize: 1.25,
    pixelResolution: 200,
    speed: 1.25,
    depthFade: 8,
    farPlane: 20,
    brightness: 1,
    density: 0.3,
    variant: "square",
    direction: 125,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", position: "relative", background: "#0a0a1a" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PixelSnow>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Snowflakes: Story = {
  args: {
    variant: "snowflake",
    flakeSize: 0.015,
    speed: 0.8,
    density: 0.4,
    brightness: 1.5,
  },
}
