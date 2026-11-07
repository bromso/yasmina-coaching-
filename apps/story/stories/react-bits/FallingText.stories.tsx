import FallingText from "@repo/ui/components/FallingText"
import type { Meta, StoryObj } from "@storybook/react-vite"

const meta = {
  title: "React Bits/TextAnimations/FallingText",
  component: FallingText,
  parameters: {
    layout: "fullscreen",
  },
  tags: ["autodocs"],
  argTypes: {
    text: {
      control: { type: "text" },
      description: "The text content whose words fall with physics",
    },
    highlightWords: {
      control: { type: "object" },
      description: "Array of words to highlight in cyan",
    },
    trigger: {
      control: { type: "select" },
      options: ["auto", "scroll", "click", "hover"],
      description: "How the falling animation is triggered",
    },
    backgroundColor: {
      control: { type: "color" },
      description: "Background color of the Matter.js render canvas",
    },
    wireframes: {
      control: { type: "boolean" },
      description: "Show Matter.js wireframe debug rendering",
    },
    gravity: {
      control: { type: "range", min: 0, max: 5, step: 0.1 },
      description: "Gravity strength for the physics simulation",
    },
    mouseConstraintStiffness: {
      control: { type: "range", min: 0.01, max: 1, step: 0.01 },
      description: "Stiffness of mouse drag interaction",
    },
    fontSize: {
      control: { type: "text" },
      description: "CSS font-size value for the text",
    },
  },
  args: {
    text: "The quick brown fox jumps over the lazy dog and all the words come tumbling down with physics",
    highlightWords: ["quick", "fox", "physics"],
    trigger: "auto",
    backgroundColor: "transparent",
    wireframes: false,
    gravity: 1,
    mouseConstraintStiffness: 0.2,
    fontSize: "2rem",
  },
  decorators: [
    (Story) => (
      <div style={{ width: "100vw", height: "100vh", background: "#111" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FallingText>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ClickTrigger: Story = {
  args: {
    text: "Click anywhere to make these words fall down with realistic physics simulation",
    highlightWords: ["Click", "fall"],
    trigger: "click",
    fontSize: "1.5rem",
  },
}

export const LowGravity: Story = {
  args: {
    text: "These words float gently in low gravity like they are on the moon",
    highlightWords: ["float", "moon"],
    gravity: 0.2,
    fontSize: "2rem",
  },
}
