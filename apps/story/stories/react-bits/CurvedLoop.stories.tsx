import CurvedLoop from "@repo/ui/components/CurvedLoop"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/TextAnimations/CurvedLoop",
  component: CurvedLoop,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    marqueeText: {
      control: { type: "text" },
      description: "Text to display in the curved marquee",
    },
    speed: {
      control: { type: "range", min: 0.5, max: 10, step: 0.5 },
      description: "Speed of the marquee scroll",
    },
    curveAmount: {
      control: { type: "range", min: 0, max: 800, step: 10 },
      description: "Amount of curve applied to the SVG path",
    },
    direction: {
      control: { type: "select" },
      options: ["left", "right"],
      description: "Direction the marquee scrolls",
    },
    interactive: {
      control: { type: "boolean" },
      description: "Allow drag interaction to control scroll direction",
    },
    className: {
      control: { type: "text" },
      description: "CSS class applied to the SVG text element",
    },
  },
  args: {
    marqueeText: "React Bits is awesome ",
    speed: 2,
    curveAmount: 400,
    direction: "left",
    interactive: true,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100%", minWidth: "800px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CurvedLoop>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const FlatMarquee: Story = {
  args: {
    marqueeText: "Flat scrolling text ",
    curveAmount: 0,
    speed: 3,
  },
}

export const RightDirection: Story = {
  args: {
    marqueeText: "Scrolling right ",
    direction: "right",
    curveAmount: 200,
    speed: 4,
  },
}
