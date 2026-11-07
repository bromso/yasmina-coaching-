import ShapeBlur from "@repo/ui/components/ShapeBlur"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/Animations/ShapeBlur",
  component: ShapeBlur,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  argTypes: {
    variation: {
      control: { type: "number", min: 0, max: 3, step: 1 },
      description: "Shape variation: 0=Rounded Rect, 1=Filled Circle, 2=Circle Stroke, 3=Triangle",
    },
    shapeSize: { control: { type: "number", min: 0.5, max: 3, step: 0.1 } },
    roundness: { control: { type: "number", min: 0, max: 1, step: 0.05 } },
    borderSize: { control: { type: "number", min: 0.01, max: 0.2, step: 0.01 } },
    circleSize: { control: { type: "number", min: 0.1, max: 1, step: 0.05 } },
    circleEdge: { control: { type: "number", min: 0.1, max: 1, step: 0.05 } },
    pixelRatioProp: { control: { type: "number", min: 1, max: 3, step: 0.5 } },
  },
  args: {
    variation: 0,
    shapeSize: 1.2,
    roundness: 0.4,
    borderSize: 0.05,
    circleSize: 0.3,
    circleEdge: 0.5,
    pixelRatioProp: 2,
  },
} satisfies Meta<typeof ShapeBlur>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a" }}>
      <ShapeBlur {...args} />
    </div>
  ),
}

export const CircleFill: Story = {
  args: {
    variation: 1,
    circleSize: 0.4,
    circleEdge: 0.6,
  },
  render: (args) => (
    <div style={{ width: "100vw", height: "100vh", background: "#0a0a0a" }}>
      <ShapeBlur {...args} />
    </div>
  ),
}
