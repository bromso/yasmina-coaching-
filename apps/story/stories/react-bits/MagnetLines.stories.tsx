import MagnetLines from "@repo/ui/components/MagnetLines"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/MagnetLines",
  component: MagnetLines,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    rows: {
      control: { type: "range", min: 3, max: 20, step: 1 },
      description: "Number of rows in the grid",
    },
    columns: {
      control: { type: "range", min: 3, max: 20, step: 1 },
      description: "Number of columns in the grid",
    },
    containerSize: {
      control: { type: "text" },
      description: "CSS size of the container (e.g., '80vmin', '400px')",
    },
    lineColor: {
      control: { type: "color" },
      description: "Color of the lines",
    },
    lineWidth: {
      control: { type: "text" },
      description: "CSS width of each line",
    },
    lineHeight: {
      control: { type: "text" },
      description: "CSS height of each line",
    },
    baseAngle: {
      control: { type: "range", min: -180, max: 180, step: 5 },
      description: "Default rotation angle in degrees",
    },
  },
  args: {
    rows: 9,
    columns: 9,
    containerSize: "400px",
    lineColor: "#efefef",
    lineWidth: "1vmin",
    lineHeight: "6vmin",
    baseAngle: -10,
  },
} satisfies Meta<typeof MagnetLines>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const DenseGrid: Story = {
  args: {
    rows: 15,
    columns: 15,
    lineColor: "#5227FF",
    lineHeight: "4vmin",
    containerSize: "500px",
  },
}
