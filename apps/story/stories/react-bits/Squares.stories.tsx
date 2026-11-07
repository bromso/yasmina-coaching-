import Squares from "@repo/ui/components/Squares"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/Squares",
  component: Squares,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    direction: {
      control: "select",
      options: ["diagonal", "up", "right", "down", "left"],
    },
    speed: { control: { type: "range", min: 0.1, max: 5, step: 0.1 } },
    borderColor: { control: "color" },
    squareSize: { control: { type: "range", min: 10, max: 100, step: 5 } },
    hoverFillColor: { control: "color" },
  },
  args: {
    direction: "right",
    speed: 1,
    borderColor: "#999",
    squareSize: 40,
    hoverFillColor: "#222",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", background: "#060010" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Squares>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const DiagonalGreen: Story = {
  args: {
    direction: "diagonal",
    borderColor: "#1a3a1a",
    hoverFillColor: "#0a2a0a",
    squareSize: 30,
    speed: 0.5,
  },
}
