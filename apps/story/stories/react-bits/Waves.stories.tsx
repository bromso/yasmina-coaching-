import Waves from "@repo/ui/components/Waves"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/Waves",
  component: Waves,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    lineColor: { control: "color" },
    backgroundColor: { control: "color" },
    waveSpeedX: { control: { type: "range", min: 0, max: 0.1, step: 0.005 } },
    waveSpeedY: { control: { type: "range", min: 0, max: 0.05, step: 0.001 } },
    waveAmpX: { control: { type: "range", min: 0, max: 100, step: 5 } },
    waveAmpY: { control: { type: "range", min: 0, max: 50, step: 2 } },
    xGap: { control: { type: "range", min: 5, max: 30, step: 1 } },
    yGap: { control: { type: "range", min: 10, max: 60, step: 2 } },
    friction: { control: { type: "range", min: 0.8, max: 0.99, step: 0.005 } },
    tension: { control: { type: "range", min: 0.001, max: 0.05, step: 0.001 } },
    maxCursorMove: { control: { type: "range", min: 10, max: 300, step: 10 } },
  },
  args: {
    lineColor: "black",
    backgroundColor: "transparent",
    waveSpeedX: 0.0125,
    waveSpeedY: 0.005,
    waveAmpX: 32,
    waveAmpY: 16,
    xGap: 10,
    yGap: 32,
    friction: 0.925,
    tension: 0.005,
    maxCursorMove: 100,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Waves>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WhiteOnDark: Story = {
  args: {
    lineColor: "#ffffff",
    backgroundColor: "#111111",
    waveAmpX: 50,
    waveAmpY: 25,
    xGap: 8,
  },
}
