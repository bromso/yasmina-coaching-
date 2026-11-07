import TextCursor from "@repo/ui/components/TextCursor"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/TextAnimations/TextCursor",
  component: TextCursor,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    text: {
      control: { type: "text" },
      description: "Text or emoji to display at each cursor trail point",
    },
    spacing: {
      control: { type: "range", min: 20, max: 300, step: 10 },
      description: "Minimum pixel distance between trail points",
    },
    followMouseDirection: {
      control: { type: "boolean" },
      description: "Rotate the text to follow the mouse movement direction",
    },
    randomFloat: {
      control: { type: "boolean" },
      description: "Add gentle random floating animation to trail items",
    },
    exitDuration: {
      control: { type: "range", min: 0.1, max: 2, step: 0.1 },
      description: "Duration of the fade-out exit animation",
    },
    removalInterval: {
      control: { type: "range", min: 10, max: 200, step: 10 },
      description: "Interval in ms for removing stale trail items",
    },
    maxPoints: {
      control: { type: "range", min: 1, max: 20, step: 1 },
      description: "Maximum number of trail points visible at once",
    },
  },
  args: {
    text: "Hello",
    spacing: 100,
    followMouseDirection: true,
    randomFloat: true,
    exitDuration: 0.5,
    removalInterval: 30,
    maxPoints: 5,
  },
  decorators: [
    (Story) => (
      <div style={{ width: "600px", height: "400px", background: "#111", borderRadius: "8px" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TextCursor>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const EmojiTrail: Story = {
  args: {
    text: "🔥",
    spacing: 60,
    maxPoints: 10,
    followMouseDirection: false,
  },
}

export const DenseTrail: Story = {
  args: {
    text: "React",
    spacing: 40,
    maxPoints: 15,
    randomFloat: false,
    followMouseDirection: true,
    exitDuration: 1,
  },
}
