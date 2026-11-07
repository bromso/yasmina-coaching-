import FloatingLines from "@repo/ui/components/FloatingLines"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Backgrounds/FloatingLines",
  component: FloatingLines,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    linesGradient: {
      control: { type: "object" },
      description: "Array of hex colors for line gradient",
    },
    enabledWaves: {
      control: { type: "object" },
      description: "Which wave layers to enable: top, middle, bottom",
    },
    lineCount: {
      control: { type: "object" },
      description: "Number of lines per wave layer",
    },
    lineDistance: {
      control: { type: "object" },
      description: "Distance between lines per wave layer",
    },
    animationSpeed: {
      control: { type: "range", min: 0, max: 5, step: 0.1 },
      description: "Animation speed multiplier",
    },
    interactive: { control: "boolean", description: "Enable mouse bending interaction" },
    bendRadius: {
      control: { type: "range", min: 0, max: 20, step: 0.5 },
      description: "Mouse bend radius",
    },
    bendStrength: {
      control: { type: "range", min: -2, max: 2, step: 0.1 },
      description: "Mouse bend strength",
    },
    parallax: { control: "boolean", description: "Enable parallax mouse effect" },
    parallaxStrength: {
      control: { type: "range", min: 0, max: 1, step: 0.05 },
      description: "Parallax strength",
    },
  },
  args: {
    enabledWaves: ["top", "middle", "bottom"],
    lineCount: [6],
    lineDistance: [5],
    animationSpeed: 1,
    interactive: true,
    bendRadius: 5.0,
    bendStrength: -0.5,
    parallax: true,
    parallaxStrength: 0.2,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FloatingLines>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const GradientLines: Story = {
  args: {
    linesGradient: ["#ff0080", "#7928ca", "#0070f3"],
    lineCount: [10],
    animationSpeed: 1.5,
  },
}
